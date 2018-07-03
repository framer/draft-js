/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 *  strict-local
 */

'use strict';

var DraftJsDebugLogging = require('./DraftJsDebugLogging');
var EditorState = require('./EditorState');
var ReactDOM = require('react-dom');

var getDraftEditorSelection = require('./getDraftEditorSelection');
var invariant = require('fbjs/lib/invariant');

function editOnSelect(editor) {
  if (editor._blockSelectEvents || editor._latestEditorState !== editor.props.editorState) {
    if (editor._blockSelectEvents) {
      var _editorState = editor.props.editorState;
      var selectionState = _editorState.getSelection();
      DraftJsDebugLogging.logBlockedSelectionEvent({
        // For now I don't think we need any other info
        anonymizedDom: 'N/A',
        extraParams: JSON.stringify({ stacktrace: new Error().stack }),
        selectionState: JSON.stringify(selectionState.toJS())
      });
    }
    return;
  }

  var editorState = editor.props.editorState;
  var editorNode = ReactDOM.findDOMNode(editor.editorContainer);
  !editorNode ? process.env.NODE_ENV !== 'production' ? invariant(false, 'Missing editorNode') : invariant(false) : void 0;
  !(editorNode.firstChild instanceof HTMLElement) ? process.env.NODE_ENV !== 'production' ? invariant(false, 'editorNode.firstChild is not an HTMLElement') : invariant(false) : void 0;
  var documentSelection = getDraftEditorSelection(editorState, editorNode.firstChild);
  var updatedSelectionState = documentSelection.selectionState;

  if (updatedSelectionState !== editorState.getSelection()) {
    if (documentSelection.needsRecovery) {
      editorState = EditorState.forceSelection(editorState, updatedSelectionState);
    } else {
      editorState = EditorState.acceptSelection(editorState, updatedSelectionState);
    }
    editor.update(editorState);
  }
}

module.exports = editOnSelect;