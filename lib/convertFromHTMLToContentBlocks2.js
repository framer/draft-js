/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * 
 */

'use strict';

var _extends = _assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _knownListItemDepthCl,
    _assign = require('object-assign');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var CharacterMetadata = require('./CharacterMetadata');
var ContentBlock = require('./ContentBlock');
var ContentBlockNode = require('./ContentBlockNode');
var DefaultDraftBlockRenderMap = require('./DefaultDraftBlockRenderMap');
var DraftEntity = require('./DraftEntity');

var _require = require('immutable'),
    List = _require.List,
    Map = _require.Map,
    OrderedSet = _require.OrderedSet;

var URI = require('fbjs/lib/URI');

var cx = require('fbjs/lib/cx');
var generateRandomKey = require('./generateRandomKey');
var getSafeBodyFromHTML = require('./getSafeBodyFromHTML');
var gkx = require('./gkx');

var experimentalTreeDataSupport = gkx('draft_tree_data_support');

var NBSP = '&nbsp;';
var SPACE = ' ';

// used for replacing characters in HTML
var REGEX_CR = new RegExp('\r', 'g');
var REGEX_LF = new RegExp('\n', 'g');
var REGEX_NBSP = new RegExp(NBSP, 'g');
var REGEX_CARRIAGE = new RegExp('&#13;?', 'g');
var REGEX_ZWS = new RegExp('&#8203;?', 'g');

// https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
var boldValues = ['bold', 'bolder', '500', '600', '700', '800', '900'];
var notBoldValues = ['light', 'lighter', '100', '200', '300', '400'];

var anchorAttr = ['className', 'href', 'rel', 'target', 'title'];
var imgAttr = ['alt', 'className', 'height', 'src', 'width'];

var knownListItemDepthClasses = (_knownListItemDepthCl = {}, _defineProperty(_knownListItemDepthCl, cx('public/DraftStyleDefault/depth0'), 0), _defineProperty(_knownListItemDepthCl, cx('public/DraftStyleDefault/depth1'), 1), _defineProperty(_knownListItemDepthCl, cx('public/DraftStyleDefault/depth2'), 2), _defineProperty(_knownListItemDepthCl, cx('public/DraftStyleDefault/depth3'), 3), _defineProperty(_knownListItemDepthCl, cx('public/DraftStyleDefault/depth4'), 4), _knownListItemDepthCl);

var HTMLTagToInlineStyleMap = Map({
  b: 'BOLD',
  code: 'CODE',
  del: 'STRIKETHROUGH',
  em: 'ITALIC',
  i: 'ITALIC',
  s: 'STRIKETHROUGH',
  strike: 'STRIKETHROUGH',
  strong: 'BOLD',
  u: 'UNDERLINE'
});

/**
 * Build a mapping from HTML tags to draftjs block types
 * out of a BlockRenderMap.
 *
 * The BlockTypeMap for the default BlockRenderMap looks like this:
 *   Map({
 *     h1: 'header-one',
 *     h2: 'header-two',
 *     h3: 'header-three',
 *     h4: 'header-four',
 *     h5: 'header-five',
 *     h6: 'header-six',
 *     blockquote: 'blockquote',
 *     figure: 'atomic',
 *     pre: ['code-block'],
 *     div: 'unstyled',
 *     p: 'unstyled',
 *     li: ['ordered-list-item', 'unordered-list-item'],
 *   })
 */
var buildBlockTypeMap = function buildBlockTypeMap(blockRenderMap) {
  var blockTypeMap = {};

  blockRenderMap.mapKeys(function (blockType, desc) {
    var elements = [desc.element];
    if (desc.aliasedElements !== undefined) {
      elements.push.apply(elements, desc.aliasedElements);
    }
    elements.forEach(function (element) {
      if (blockTypeMap[element] === undefined) {
        blockTypeMap[element] = blockType;
      } else if (typeof blockTypeMap[element] === 'string') {
        blockTypeMap[element] = [blockTypeMap[element], blockType];
      } else {
        blockTypeMap[element].push(blockType);
      }
    });
  });

  return Map(blockTypeMap);
};

/**
 * If we're pasting from one DraftEditor to another we can check to see if
 * existing list item depth classes are being used and preserve this style
 */
var getListItemDepth = function getListItemDepth(node) {
  var depth = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

  Object.keys(knownListItemDepthClasses).some(function (depthClass) {
    if (node.classList.contains(depthClass)) {
      depth = knownListItemDepthClasses[depthClass];
    }
  });
  return depth;
};

/**
 * Return true if the provided HTML Element can be used to build a
 * Draftjs-compatible link.
 */
var isValidAnchor = function isValidAnchor(node) {
  return !!(node instanceof HTMLAnchorElement && node.href && (node.protocol === 'http:' || node.protocol === 'https:' || node.protocol === 'mailto:'));
};

/**
 * Return true if the provided HTML Element can be used to build a
 * Draftjs-compatible image.
 */
var isValidImage = function isValidImage(node) {
  return !!(node instanceof HTMLImageElement && node.attributes.getNamedItem('src') && node.attributes.getNamedItem('src').value);
};

/**
 * Determine if a nodeName is a list type, 'ul' or 'ol'
 */
var isListNode = function isListNode(nodeName) {
  return nodeName === 'ul' || nodeName === 'ol';
};

/**
 *  ContentBlockConfig is a mutable data structure that holds all
 *  the information required to build a ContentBlock and an array of
 *  all the child nodes (childConfigs).
 *  It is being used a temporary data structure by the
 *  ContentBlocksBuilder class.
 */

/**
 * ContentBlocksBuilder builds a list of ContentBlocks and an Entity Map
 * out of one (or several) HTMLElement(s).
 *
 * The algorithm has two passes: first it builds a tree of ContentBlockConfigs
 * by walking through the HTML nodes and their children, then it walks the
 * ContentBlockConfigs tree to compute parents/siblings and create
 * the actual ContentBlocks.
 *
 * Typical usage is:
 *     new ContentBlocksBuilder()
 *        .addDOMNode(someHTMLNode)
 *        .addDOMNode(someOtherHTMLNode)
 *       .getContentBlocks();
 *
 */
var ContentBlocksBuilder = function () {

  // Map HTML tags to draftjs block types and disambiguation function


  // The content blocks generated from the blockConfigs

  // Most of the method in the class depend on the state of the content builder
  // (i.e. currentBlockType, currentDepth, currentEntity etc.). Though it may
  // be confusing at first, it made the code simpler than the alternative which
  // is to pass those values around in every call.

  // The following attributes are used to accumulate text and styles
  // as we are walking the HTML node tree.
  function ContentBlocksBuilder(blockTypeMap, disambiguate) {
    _classCallCheck(this, ContentBlocksBuilder);

    this.clear();
    this.blockTypeMap = blockTypeMap;
    this.disambiguate = disambiguate;
  }

  /**
   * Clear the internal state of the ContentBlocksBuilder
   */


  // Entity map use to store links and images found in the HTML nodes


  // Describes the future ContentState as a tree of content blocks


  ContentBlocksBuilder.prototype.clear = function clear() {
    this.characterList = List();
    this.blockConfigs = [];
    this.currentBlockType = 'unstyled';
    this.currentDepth = -1;
    this.currentEntity = null;
    this.currentStyle = OrderedSet();
    this.currentText = '';
    this.entityMap = DraftEntity;
    this.wrapper = 'ul';
    this.contentBlocks = [];
  };

  /**
   * Add an HTMLElement to the ContentBlocksBuilder
   */


  ContentBlocksBuilder.prototype.addDOMNode = function addDOMNode(node) {
    var _blockConfigs;

    this.contentBlocks = [];
    // Converts the HTML node to block config
    (_blockConfigs = this.blockConfigs).push.apply(_blockConfigs, this._toBlockConfigs([node]));

    // There might be some left over text in the builder's
    // internal state, if so make a ContentBlock out of it.
    this._trimCurrentText();
    if (this.currentText !== '') {
      this.blockConfigs.push(this._makeBlockConfig());
    }

    // for chaining
    return this;
  };

  /**
   * Return the ContentBlocks and the EntityMap that corresponds
   * to the previously added HTML nodes.
   */


  ContentBlocksBuilder.prototype.getContentBlocks = function getContentBlocks() {
    if (this.contentBlocks.length === 0) {
      if (experimentalTreeDataSupport) {
        this._toContentBlocks(this.blockConfigs);
      } else {
        this._toFlatContentBlocks(this.blockConfigs);
      }
    }
    return {
      contentBlocks: this.contentBlocks,
      entityMap: this.entityMap
    };
  };

  /**
   * Add a new inline style to the upcoming nodes.
   */


  ContentBlocksBuilder.prototype.addStyle = function addStyle(inlineStyle) {
    this.currentStyle = this.currentStyle.add(inlineStyle);
  };

  /**
   * Remove a currently applied inline style.
   */


  ContentBlocksBuilder.prototype.removeStyle = function removeStyle(inlineStyle) {
    this.currentStyle = this.currentStyle.remove(inlineStyle);
  };

  // ***********************************WARNING******************************
  // The methods below this line are private - don't call them directly.

  /**
   * Generate a new ContentBlockConfig out of the current internal state
   * of the builder, then clears the internal state.
   */


  ContentBlocksBuilder.prototype._makeBlockConfig = function _makeBlockConfig() {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    var key = config.key || generateRandomKey();
    var block = _extends({
      key: key,
      type: this.currentBlockType,
      text: this.currentText,
      characterList: this.characterList,
      depth: Math.max(0, this.currentDepth),
      parent: null,
      children: List(),
      prevSibling: null,
      nextSibling: null,
      childConfigs: []
    }, config);
    this.characterList = List();
    this.currentBlockType = 'unstyled';
    this.currentDepth = -1;
    this.currentText = '';
    return block;
  };

  /**
   * Converts an array of HTML elements to a multi-root tree of content
   * block configs. Some text content may be left in the builders internal
   * state to enable chaining sucessive calls.
   */


  ContentBlocksBuilder.prototype._toBlockConfigs = function _toBlockConfigs(nodes) {
    var blockConfigs = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var nodeName = node.nodeName.toLowerCase();

      if (nodeName === 'body' || isListNode(nodeName)) {
        // body, ol and ul are 'block' type nodes so create a block config
        // with the text accumulated so far (if any)
        this._trimCurrentText();
        if (this.currentText !== '') {
          blockConfigs.push(this._makeBlockConfig());
        }

        // body, ol and ul nodes are ignored, but their children are inlined in
        // the parent block config.
        var wasCurrentDepth = this.currentDepth;
        var wasWrapper = this.wrapper;
        if (isListNode(nodeName)) {
          this.wrapper = nodeName;
          if (isListNode(wasWrapper)) {
            this.currentDepth++;
          }
        }
        blockConfigs.push.apply(blockConfigs, this._toBlockConfigs(Array.from(node.childNodes)));
        this.currentDepth = wasCurrentDepth;
        this.wrapper = wasWrapper;
        continue;
      }

      var blockType = this.blockTypeMap.get(nodeName);
      if (blockType !== undefined) {
        // 'block' type node means we need to create a block config
        // with the text accumulated so far (if any)
        this._trimCurrentText();
        if (this.currentText !== '') {
          blockConfigs.push(this._makeBlockConfig());
        }

        var _wasCurrentDepth = this.currentDepth;
        var _wasWrapper = this.wrapper;
        this.wrapper = nodeName === 'pre' ? 'pre' : this.wrapper;

        if (typeof blockType !== 'string') {
          blockType = this.disambiguate(nodeName, this.wrapper) || blockType[0] || 'unstyled';
        }

        if (!experimentalTreeDataSupport && node instanceof HTMLElement && (blockType === 'unordered-list-item' || blockType === 'ordered-list-item')) {
          this.currentDepth = getListItemDepth(node, this.currentDepth);
        }

        var _key = generateRandomKey();
        var _childConfigs = this._toBlockConfigs(Array.from(node.childNodes));
        this._trimCurrentText();
        blockConfigs.push(this._makeBlockConfig({
          key: _key,
          childConfigs: _childConfigs,
          type: blockType
        }));

        this.currentDepth = _wasCurrentDepth;
        this.wrapper = _wasWrapper;
        continue;
      }

      if (nodeName === '#text') {
        this._addTextNode(node);
        continue;
      }

      if (isValidImage(node)) {
        this._addImgNode(node);
        continue;
      }

      if (isValidAnchor(node)) {
        this._addAnchorNode(node, blockConfigs);
        continue;
      }

      var inlineStyle = HTMLTagToInlineStyleMap.get(nodeName);
      if (inlineStyle !== undefined) {
        this.addStyle(inlineStyle);
      }

      blockConfigs.push.apply(blockConfigs, this._toBlockConfigs(Array.from(node.childNodes)));

      if (inlineStyle !== undefined) {
        this.removeStyle(inlineStyle);
      }

      this._updateStyleFromNodeAttributes(node);
    }

    return blockConfigs;
  };

  /**
   * Append a string of text to the internal buffer.
   */


  ContentBlocksBuilder.prototype._appendText = function _appendText(text) {
    var _characterList;

    this.currentText += text;
    var characterMetadata = CharacterMetadata.create({
      style: this.currentStyle,
      entity: this.currentEntity
    });
    this.characterList = (_characterList = this.characterList).push.apply(_characterList, Array(text.length).fill(characterMetadata));
  };

  /**
   * Trim the text in the internal buffer.
   */


  ContentBlocksBuilder.prototype._trimCurrentText = function _trimCurrentText() {
    var l = this.currentText.length;
    var begin = l - this.currentText.trimLeft().length;
    var end = this.currentText.trimRight().length;

    // We should not trim whitespaces for which an entity is defined.
    var entity = this.characterList.findEntry(function (characterMetadata) {
      return characterMetadata.getEntity() !== null;
    });
    begin = entity !== undefined ? Math.min(begin, entity[0]) : begin;

    entity = this.characterList.reverse().findEntry(function (characterMetadata) {
      return characterMetadata.getEntity() !== null;
    });
    end = entity !== undefined ? Math.max(end, l - entity[0]) : end;

    if (begin > end) {
      this.currentText = '';
      this.characterList = List();
    } else {
      this.currentText = this.currentText.slice(begin, end);
      this.characterList = this.characterList.slice(begin, end);
    }
  };

  /**
   * Add the content of an HTML text node to the internal state
   */


  ContentBlocksBuilder.prototype._addTextNode = function _addTextNode(node) {
    var text = node.textContent;
    var trimmedText = text.trim();

    // If we are not in a pre block and the trimmed content is empty,
    // normalize to a single space.
    if (trimmedText === '' && this.wrapper !== 'pre') {
      text = ' ';
    }

    if (this.wrapper !== 'pre') {
      // Can't use empty string because MSWord
      text = text.replace(REGEX_LF, SPACE);
    }

    this._appendText(text);
  };

  /**
   * Add the content of an HTML img node to the internal state
   */


  ContentBlocksBuilder.prototype._addImgNode = function _addImgNode(node) {
    if (!(node instanceof HTMLImageElement)) {
      return;
    }
    var image = node;
    var entityConfig = {};

    imgAttr.forEach(function (attr) {
      var imageAttribute = image.getAttribute(attr);
      if (imageAttribute) {
        entityConfig[attr] = imageAttribute;
      }
    });

    // TODO: T15530363 update this when we remove DraftEntity entirely
    this.currentEntity = this.entityMap.__create('IMAGE', 'MUTABLE', entityConfig);

    // The child text node cannot just have a space or return as content -
    // we strip those out.
    // See https://github.com/facebook/draft-js/issues/231 for some context.

    this._appendText('\uD83D\uDCF7');
    this.currentEntity = null;
  };

  /**
   * Add the content of an HTML 'a' node to the internal state. Child nodes
   * (if any) are converted to Block Configs and appended to the provided
   * blockConfig array.
   */


  ContentBlocksBuilder.prototype._addAnchorNode = function _addAnchorNode(node, blockConfigs) {
    // The check has already been made by isValidAnchor but
    // we have to do it again to keep flow happy.
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    var anchor = node;
    var entityConfig = {};

    anchorAttr.forEach(function (attr) {
      var anchorAttribute = anchor.getAttribute(attr);
      if (anchorAttribute) {
        entityConfig[attr] = anchorAttribute;
      }
    });

    entityConfig.url = new URI(anchor.href).toString();
    // TODO: T15530363 update this when we remove DraftEntity completely
    this.currentEntity = this.entityMap.__create('LINK', 'MUTABLE', entityConfig || {});

    blockConfigs.push.apply(blockConfigs, this._toBlockConfigs(Array.from(node.childNodes)));
    this.currentEntity = null;
  };

  /**
   * Try to guess the inline style of an HTML element based on its css
   * styles (font-weight, font-style and text-decoration).
   */


  ContentBlocksBuilder.prototype._updateStyleFromNodeAttributes = function _updateStyleFromNodeAttributes(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    var htmlElement = node;
    var fontWeight = htmlElement.style.fontWeight;
    var fontStyle = htmlElement.style.fontStyle;
    var textDecoration = htmlElement.style.textDecoration;

    if (boldValues.indexOf(fontWeight) >= 0) {
      this.addStyle('BOLD');
    } else if (notBoldValues.indexOf(fontWeight) >= 0) {
      this.removeStyle('BOLD');
    }

    if (fontStyle === 'italic') {
      this.addStyle('ITALIC');
    } else if (fontStyle === 'normal') {
      this.removeStyle('ITALIC');
    }

    if (textDecoration === 'underline') {
      this.addStyle('UNDERLINE');
    }
    if (textDecoration === 'line-through') {
      this.addStyle('STRIKETHROUGH');
    }
    if (textDecoration === 'none') {
      this.removeStyle('UNDERLINE');
      this.removeStyle('STRIKETHROUGH');
    }
  };

  /**
   * Walk the BlockConfig tree, compute parent/children/siblings,
   * and generate the corresponding ContentBlockNode
   */


  ContentBlocksBuilder.prototype._toContentBlocks = function _toContentBlocks(blockConfigs) {
    var parent = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    var l = blockConfigs.length - 1;
    for (var i = 0; i <= l; i++) {
      var config = blockConfigs[i];
      config.parent = parent;
      config.prevSibling = i > 0 ? blockConfigs[i - 1].key : null;
      config.nextSibling = i < l ? blockConfigs[i + 1].key : null;
      config.children = List(config.childConfigs.map(function (child) {
        return child.key;
      }));
      this.contentBlocks.push(new ContentBlockNode(_extends({}, config)));
      this._toContentBlocks(config.childConfigs, config.key);
    }
  };

  // ***********************************************************************
  // The two methods below are used for backward compatibility when
  // experimentalTreeDataSupport is disabled.

  /**
   * Same as _toContentBlocks but replaces nested blocks by their
   * text content.
   */


  ContentBlocksBuilder.prototype._toFlatContentBlocks = function _toFlatContentBlocks(blockConfigs) {
    var l = blockConfigs.length - 1;
    for (var i = 0; i <= l; i++) {
      var config = blockConfigs[i];

      var _extractTextFromBlock = this._extractTextFromBlockConfigs(config.childConfigs),
          _text = _extractTextFromBlock.text,
          _characterList2 = _extractTextFromBlock.characterList;

      this.contentBlocks.push(new ContentBlock(_extends({}, config, {
        text: config.text + _text,
        characterList: config.characterList.concat(_characterList2)
      })));
    }
  };

  /**
   * Extract the text and the associated inline styles form an
   * array of content block configs.
   */


  ContentBlocksBuilder.prototype._extractTextFromBlockConfigs = function _extractTextFromBlockConfigs(blockConfigs) {
    var l = blockConfigs.length - 1;
    var text = '';
    var characterList = List();
    for (var i = 0; i <= l; i++) {
      var config = blockConfigs[i];
      text += config.text;
      characterList = characterList.concat(config.characterList);
      /* $FlowFixMe(>=0.68.0 site=www,mobile) This comment suppresses an error
       * found when Flow v0.68 was deployed. To see the error delete this
       * comment and run Flow. */
      if (text !== '' && config.blockType !== 'unstyled') {
        text += '\n';
        characterList = characterList.push(characterList.last());
      }
      var _children = this._extractTextFromBlockConfigs(config.childConfigs);
      text += _children.text;
      characterList = characterList.concat(_children.characterList);
    }
    return { text: text, characterList: characterList };
  };

  return ContentBlocksBuilder;
}();

/**
 * Converts an HTML string to an array of ContentBlocks and an EntityMap
 * suitable to initialize the internal state of a Draftjs component.
 */


var convertFromHTMLtoContentBlocks = function convertFromHTMLtoContentBlocks(html) {
  var DOMBuilder = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : getSafeBodyFromHTML;
  var blockRenderMap = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : DefaultDraftBlockRenderMap;

  // Be ABSOLUTELY SURE that the dom builder you pass here won't execute
  // arbitrary code in whatever environment you're running this in. For an
  // example of how we try to do this in-browser, see getSafeBodyFromHTML.

  // Remove funky characters from the HTML string
  html = html.trim().replace(REGEX_CR, '').replace(REGEX_NBSP, SPACE).replace(REGEX_CARRIAGE, '').replace(REGEX_ZWS, '');

  // Build a DOM tree out of the HTML string
  var safeBody = DOMBuilder(html);
  if (!safeBody) {
    return null;
  }

  // Build a BlockTypeMap out of the BlockRenderMap
  var blockTypeMap = buildBlockTypeMap(blockRenderMap);

  // Select the proper block type for the cases where the blockRenderMap
  // uses multiple block types for the same html tag.
  var disambiguate = function disambiguate(tag, wrapper) {
    if (tag === 'li') {
      return wrapper === 'ol' ? 'ordered-list-item' : 'unordered-list-item';
    }
    return null;
  };

  return new ContentBlocksBuilder(blockTypeMap, disambiguate).addDOMNode(safeBody).getContentBlocks();
};

module.exports = convertFromHTMLtoContentBlocks;