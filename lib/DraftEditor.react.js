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
 * @preventMunge
 */

'use strict';

var _assign = require('object-assign');

var _extends = _assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DefaultDraftBlockRenderMap = require('./DefaultDraftBlockRenderMap');
var DefaultDraftInlineStyle = require('./DefaultDraftInlineStyle');
var DraftEditorCompositionHandler = require('./DraftEditorCompositionHandler');
var DraftEditorContents = require('./DraftEditorContents.react');
var DraftEditorDragHandler = require('./DraftEditorDragHandler');
var DraftEditorEditHandler = require('./DraftEditorEditHandler');
var DraftEditorPlaceholder = require('./DraftEditorPlaceholder.react');
var DraftODS = require('./DraftODS');
var EditorState = require('./EditorState');
var React = require('react');
var ReactDOM = require('react-dom');
var Scroll = require('fbjs/lib/Scroll');
var Style = require('fbjs/lib/Style');
var UserAgent = require('fbjs/lib/UserAgent');

var cx = require('fbjs/lib/cx');
var emptyFunction = require('fbjs/lib/emptyFunction');
var generateRandomKey = require('./generateRandomKey');
var getDefaultKeyBinding = require('./getDefaultKeyBinding');
var getScrollPosition = require('fbjs/lib/getScrollPosition');
var gkx = require('./gkx');
var invariant = require('fbjs/lib/invariant');
var nullthrows = require('fbjs/lib/nullthrows');

var isIE = UserAgent.isBrowser('IE');

// IE does not support the `input` event on contentEditable, so we can't
// observe spellcheck behavior.
var allowSpellCheck = !isIE;

// Define a set of handler objects to correspond to each possible `mode`
// of editor behavior.
var handlerMap = {
  edit: DraftEditorEditHandler,
  composite: DraftEditorCompositionHandler,
  drag: DraftEditorDragHandler,
  cut: null,
  render: null
};

var didInitODS = false;

var UpdateDraftEditorFlags = function (_React$Component) {
  _inherits(UpdateDraftEditorFlags, _React$Component);

  function UpdateDraftEditorFlags() {
    _classCallCheck(this, UpdateDraftEditorFlags);

    return _possibleConstructorReturn(this, _React$Component.apply(this, arguments));
  }

  UpdateDraftEditorFlags.prototype.render = function render() {
    return null;
  };

  UpdateDraftEditorFlags.prototype.componentDidMount = function componentDidMount() {
    this._update();
  };

  UpdateDraftEditorFlags.prototype.componentDidUpdate = function componentDidUpdate() {
    this._update();
  };

  UpdateDraftEditorFlags.prototype._update = function _update() {
    var editor = this.props.editor;
    /**
     * Sometimes a render triggers a 'focus' or other event, and that will
     * schedule a second render pass.
     * In order to make sure the second render pass gets the latest editor
     * state, we update it here.
     * Example:
     * render #1
     * +
     * |
     * | cWU -> Nothing ... latestEditorState = STALE_STATE :(
     * |
     * | render -> this.props.editorState = FRESH_STATE
     * | +         *and* set latestEditorState = FRESH_STATE
     *   |
     * | |
     * | +--> triggers 'focus' event, calling 'handleFocus' with latestEditorState
     * |                                                +
     * |                                                |
     * +>cdU -> latestEditorState = FRESH_STATE         | the 'handleFocus' call schedules render #2
     *                                                  | with latestEditorState, which is FRESH_STATE
     *                                                  |
     * render #2 <--------------------------------------+
     * +
     * |
     * | cwU -> nothing updates
     * |
     * | render -> this.props.editorState = FRESH_STATE which was passed in above
     * |
     * +>cdU fires and resets latestEditorState = FRESH_STATE
     * ---
     * Note that if we don't set latestEditorState in 'render' in the above
     * diagram, then STALE_STATE gets passed to render #2.
     */
    editor._latestEditorState = this.props.editorState;

    /**
     * The reason we set this 'blockSelectEvents' flag is that  IE will fire a
     * 'selectionChange' event when we programmatically change the selection,
     * meaning it would trigger a new select event while we are in the middle
     * of updating.
     * We found that the 'selection.addRange' was what triggered the stray
     * selectionchange event in IE.
     * To be clear - we have not been able to reproduce specific bugs related
     * to this stray selection event, but have recorded logs that some
     * conditions do cause it to get bumped into during editOnSelect.
     */
    editor._blockSelectEvents = true;
  };

  return UpdateDraftEditorFlags;
}(React.Component);

/**
 * `DraftEditor` is the root editor component. It composes a `contentEditable`
 * div, and provides a wide variety of useful function props for managing the
 * state of the editor. See `DraftEditorProps` for details.
 */


var DraftEditor = function (_React$Component2) {
  _inherits(DraftEditor, _React$Component2);

  function DraftEditor(props) {
    _classCallCheck(this, DraftEditor);

    var _this2 = _possibleConstructorReturn(this, _React$Component2.call(this, props));

    _this2.focus = function (scrollPosition) {
      var editorState = _this2.props.editorState;

      var alreadyHasFocus = editorState.getSelection().getHasFocus();
      var editorNode = ReactDOM.findDOMNode(_this2.editor);

      if (!editorNode) {
        // once in a while people call 'focus' in a setTimeout, and the node has
        // been deleted, so it can be null in that case.
        return;
      }

      var scrollParent = Style.getScrollParent(editorNode);

      var _ref = scrollPosition || getScrollPosition(scrollParent),
          x = _ref.x,
          y = _ref.y;

      !(editorNode instanceof HTMLElement) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'editorNode is not an HTMLElement') : invariant(false) : void 0;

      editorNode.focus();

      // Restore scroll position
      if (scrollParent === window) {
        window.scrollTo(x, y);
      } else {
        Scroll.setTop(scrollParent, y);
      }

      // On Chrome and Safari, calling focus on contenteditable focuses the
      // cursor at the first character. This is something you don't expect when
      // you're clicking on an input element but not directly on a character.
      // Put the cursor back where it was before the blur.
      if (!alreadyHasFocus) {
        _this2.update(EditorState.forceSelection(editorState, editorState.getSelection()));
      }
    };

    _this2.blur = function () {
      var editorNode = ReactDOM.findDOMNode(_this2.editor);
      !(editorNode instanceof HTMLElement) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'editorNode is not an HTMLElement') : invariant(false) : void 0;
      editorNode.blur();
    };

    _this2.setMode = function (mode) {
      _this2._handler = handlerMap[mode];
    };

    _this2.exitCurrentMode = function () {
      _this2.setMode('edit');
    };

    _this2.restoreEditorDOM = function (scrollPosition) {
      _this2.setState({ contentsKey: _this2.state.contentsKey + 1 }, function () {
        _this2.focus(scrollPosition);
      });
    };

    _this2.setClipboard = function (clipboard) {
      _this2._clipboard = clipboard;
    };

    _this2.getClipboard = function () {
      return _this2._clipboard;
    };

    _this2.update = function (editorState) {
      _this2._latestEditorState = editorState;
      _this2.props.onChange(editorState);
    };

    _this2.onDragEnter = function () {
      _this2._dragCount++;
    };

    _this2.onDragLeave = function () {
      _this2._dragCount--;
      if (_this2._dragCount === 0) {
        _this2.exitCurrentMode();
      }
    };

    _this2._blockSelectEvents = false;
    _this2._clipboard = null;
    _this2._handler = null;
    _this2._dragCount = 0;
    _this2._editorKey = props.editorKey || generateRandomKey();
    _this2._placeholderAccessibilityID = 'placeholder-' + _this2._editorKey;
    _this2._latestEditorState = props.editorState;
    _this2._latestCommittedEditorState = props.editorState;

    _this2._onBeforeInput = _this2._buildHandler('onBeforeInput');
    _this2._onBlur = _this2._buildHandler('onBlur');
    _this2._onCharacterData = _this2._buildHandler('onCharacterData');
    _this2._onCompositionEnd = _this2._buildHandler('onCompositionEnd');
    _this2._onCompositionStart = _this2._buildHandler('onCompositionStart');
    _this2._onCopy = _this2._buildHandler('onCopy');
    _this2._onCut = _this2._buildHandler('onCut');
    _this2._onDragEnd = _this2._buildHandler('onDragEnd');
    _this2._onDragOver = _this2._buildHandler('onDragOver');
    _this2._onDragStart = _this2._buildHandler('onDragStart');
    _this2._onDrop = _this2._buildHandler('onDrop');
    _this2._onInput = _this2._buildHandler('onInput');
    _this2._onFocus = _this2._buildHandler('onFocus');
    _this2._onKeyDown = _this2._buildHandler('onKeyDown');
    _this2._onKeyPress = _this2._buildHandler('onKeyPress');
    _this2._onKeyUp = _this2._buildHandler('onKeyUp');
    _this2._onMouseDown = _this2._buildHandler('onMouseDown');
    _this2._onMouseUp = _this2._buildHandler('onMouseUp');
    _this2._onPaste = _this2._buildHandler('onPaste');
    _this2._onSelect = _this2._buildHandler('onSelect');

    _this2.getEditorKey = function () {
      return _this2._editorKey;
    };

    if (process.env.NODE_ENV !== 'production') {
      ['onDownArrow', 'onEscape', 'onLeftArrow', 'onRightArrow', 'onTab', 'onUpArrow'].forEach(function (propName) {
        if (props.hasOwnProperty(propName)) {
          // eslint-disable-next-line no-console
          console.warn('Supplying an `' + propName + '` prop to `DraftEditor` has ' + 'been deprecated. If your handler needs access to the keyboard ' + 'event, supply a custom `keyBindingFn` prop that falls back to ' + 'the default one (eg. https://is.gd/RG31RJ).');
        }
      });
    }

    // See `restoreEditorDOM()`.
    _this2.state = { contentsKey: 0 };
    return _this2;
  }

  /**
   * Build a method that will pass the event to the specified handler method.
   * This allows us to look up the correct handler function for the current
   * editor mode, if any has been specified.
   */


  /**
   * Define proxies that can route events to the current handler.
   */


  DraftEditor.prototype._buildHandler = function _buildHandler(eventName) {
    var _this3 = this;

    var flushControlled = ReactDOM.unstable_flushControlled;
    // Wrap event handlers in `flushControlled`. In sync mode, this is
    // effetively a no-op. In async mode, this ensures all updates scheduled
    // inside the handler are flushed before React yields to the browser.
    return function (e) {
      if (!_this3.props.readOnly) {
        var method = _this3._handler && _this3._handler[eventName];
        if (method) {
          if (flushControlled) {
            flushControlled(function () {
              return method(_this3, e);
            });
          } else {
            method(_this3, e);
          }
        }
      }
    };
  };

  DraftEditor.prototype._showPlaceholder = function _showPlaceholder() {
    return !!this.props.placeholder && !this.props.editorState.isInCompositionMode() && !this.props.editorState.getCurrentContent().hasText();
  };

  DraftEditor.prototype._renderPlaceholder = function _renderPlaceholder() {
    if (this._showPlaceholder()) {
      var placeHolderProps = {
        text: nullthrows(this.props.placeholder),
        editorState: this.props.editorState,
        textAlignment: this.props.textAlignment,
        accessibilityID: this._placeholderAccessibilityID
      };

      return React.createElement(DraftEditorPlaceholder, placeHolderProps);
    }
    return null;
  };

  DraftEditor.prototype.render = function render() {
    var _this4 = this;

    var _props = this.props,
        blockRenderMap = _props.blockRenderMap,
        blockRendererFn = _props.blockRendererFn,
        blockStyleFn = _props.blockStyleFn,
        customStyleFn = _props.customStyleFn,
        customStyleMap = _props.customStyleMap,
        editorState = _props.editorState,
        readOnly = _props.readOnly,
        textAlignment = _props.textAlignment,
        textDirectionality = _props.textDirectionality;


    var rootClass = cx({
      'DraftEditor/root': true,
      'DraftEditor/alignLeft': textAlignment === 'left',
      'DraftEditor/alignRight': textAlignment === 'right',
      'DraftEditor/alignCenter': textAlignment === 'center'
    });

    var contentStyle = {
      outline: 'none',
      // fix parent-draggable Safari bug. #1326
      userSelect: 'text',
      WebkitUserSelect: 'text',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word'
    };

    // The aria-expanded and aria-haspopup properties should only be rendered
    // for a combobox.
    /* $FlowFixMe(>=0.68.0 site=www,mobile) This comment suppresses an error
     * found when Flow v0.68 was deployed. To see the error delete this comment
     * and run Flow. */
    var ariaRole = this.props.role || 'textbox';
    var ariaExpanded = ariaRole === 'combobox' ? !!this.props.ariaExpanded : null;

    var editorContentsProps = {
      blockRenderMap: blockRenderMap,
      blockRendererFn: blockRendererFn,
      blockStyleFn: blockStyleFn,
      customStyleMap: _extends({}, DefaultDraftInlineStyle, customStyleMap),
      customStyleFn: customStyleFn,
      editorKey: this._editorKey,
      editorState: editorState,
      key: 'contents' + this.state.contentsKey,
      textDirectionality: textDirectionality
    };

    return React.createElement(
      'div',
      { className: rootClass },
      this._renderPlaceholder(),
      React.createElement(
        'div',
        {
          className: cx('DraftEditor/editorContainer'),
          ref: function ref(_ref3) {
            return _this4.editorContainer = _ref3;
          } },
        React.createElement(
          'div',
          {
            'aria-activedescendant': readOnly ? null : this.props.ariaActiveDescendantID,
            'aria-autocomplete': readOnly ? null : this.props.ariaAutoComplete,
            'aria-controls': readOnly ? null : this.props.ariaControls,
            'aria-describedby': this.props.ariaDescribedBy || this._placeholderAccessibilityID,
            'aria-expanded': readOnly ? null : ariaExpanded,
            'aria-label': this.props.ariaLabel,
            'aria-labelledby': this.props.ariaLabelledBy,
            'aria-multiline': this.props.ariaMultiline,
            autoCapitalize: this.props.autoCapitalize,
            autoComplete: this.props.autoComplete,
            autoCorrect: this.props.autoCorrect,
            className: cx({
              // Chrome's built-in translation feature mutates the DOM in ways
              // that Draft doesn't expect (ex: adding <font> tags inside
              // DraftEditorLeaf spans) and causes problems. We add notranslate
              // here which makes its autotranslation skip over this subtree.
              notranslate: !readOnly,
              'public/DraftEditor/content': true
            }),
            contentEditable: !readOnly,
            'data-testid': this.props.webDriverTestID,
            onBeforeInput: this._onBeforeInput,
            onBlur: this._onBlur,
            onCompositionEnd: this._onCompositionEnd,
            onCompositionStart: this._onCompositionStart,
            onCopy: this._onCopy,
            onCut: this._onCut,
            onDragEnd: this._onDragEnd,
            onDragEnter: this.onDragEnter,
            onDragLeave: this.onDragLeave,
            onDragOver: this._onDragOver,
            onDragStart: this._onDragStart,
            onDrop: this._onDrop,
            onFocus: this._onFocus,
            onInput: this._onInput,
            onKeyDown: this._onKeyDown,
            onKeyPress: this._onKeyPress,
            onKeyUp: this._onKeyUp,
            onMouseUp: this._onMouseUp,
            onPaste: this._onPaste,
            onSelect: this._onSelect,
            ref: function ref(_ref2) {
              return _this4.editor = _ref2;
            },
            role: readOnly ? null : ariaRole,
            spellCheck: allowSpellCheck && this.props.spellCheck,
            style: contentStyle,
            suppressContentEditableWarning: true,
            tabIndex: this.props.tabIndex },
          React.createElement(UpdateDraftEditorFlags, { editor: this, editorState: editorState }),
          React.createElement(DraftEditorContents, editorContentsProps)
        )
      )
    );
  };

  DraftEditor.prototype.componentDidMount = function componentDidMount() {
    if (!didInitODS && gkx('draft_ods_enabled')) {
      didInitODS = true;
      DraftODS.init();
    }
    this.setMode('edit');

    /**
     * IE has a hardcoded "feature" that attempts to convert link text into
     * anchors in contentEditable DOM. This breaks the editor's expectations of
     * the DOM, and control is lost. Disable it to make IE behave.
     * See: http://blogs.msdn.com/b/ieinternals/archive/2010/09/15/
     * ie9-beta-minor-change-list.aspx
     */
    if (isIE) {
      document.execCommand('AutoUrlDetect', false, false);
    }
  };

  DraftEditor.prototype.componentDidUpdate = function componentDidUpdate() {
    this._blockSelectEvents = false;
    // moving this here, when it was previously set in componentWillUpdate
    this._latestEditorState = this.props.editorState;
    this._latestCommittedEditorState = this.props.editorState;
  };

  /**
   * Used via `this.focus()`.
   *
   * Force focus back onto the editor node.
   *
   * We attempt to preserve scroll position when focusing. You can also pass
   * a specified scroll position (for cases like `cut` behavior where it should
   * be restored to a known position).
   */


  /**
   * Used via `this.setMode(...)`.
   *
   * Set the behavior mode for the editor component. This switches the current
   * handler module to ensure that DOM events are managed appropriately for
   * the active mode.
   */


  /**
   * Used via `this.restoreEditorDOM()`.
   *
   * Force a complete re-render of the DraftEditorContents based on the current
   * EditorState. This is useful when we know we are going to lose control of
   * the DOM state (cut command, IME) and we want to make sure that
   * reconciliation occurs on a version of the DOM that is synchronized with
   * our EditorState.
   */


  /**
   * Used via `this.setClipboard(...)`.
   *
   * Set the clipboard state for a cut/copy event.
   */


  /**
   * Used via `this.getClipboard()`.
   *
   * Retrieve the clipboard state for a cut/copy event.
   */


  /**
   * Used via `this.update(...)`.
   *
   * Propagate a new `EditorState` object to higher-level components. This is
   * the method by which event handlers inform the `DraftEditor` component of
   * state changes. A component that composes a `DraftEditor` **must** provide
   * an `onChange` prop to receive state updates passed along from this
   * function.
   */


  /**
   * Used in conjunction with `onDragLeave()`, by counting the number of times
   * a dragged element enters and leaves the editor (or any of its children),
   * to determine when the dragged element absolutely leaves the editor.
   */


  /**
   * See `onDragEnter()`.
   */


  return DraftEditor;
}(React.Component);

DraftEditor.defaultProps = {
  blockRenderMap: DefaultDraftBlockRenderMap,
  blockRendererFn: emptyFunction.thatReturnsNull,
  blockStyleFn: emptyFunction.thatReturns(''),
  keyBindingFn: getDefaultKeyBinding,
  readOnly: false,
  spellCheck: false,
  stripPastedStyles: false
};


module.exports = DraftEditor;