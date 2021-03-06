/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow strict-local
 */

'use strict';

import type {DOMDerivedSelection} from 'DOMDerivedSelection';
import type EditorState from 'EditorState';

const getDraftEditorSelectionWithNodes = require('getDraftEditorSelectionWithNodes');
const getSelection = require('getSelection');

/**
 * Convert the current selection range to an anchor/focus pair of offset keys
 * and values that can be interpreted by components.
 */
function getDraftEditorSelection(
  editorState: EditorState,
  root: HTMLElement,
): DOMDerivedSelection {
  const selection = getSelection();

  // No active selection.
  if (selection.rangeCount === 0) {
    return {
      selectionState: editorState.getSelection().set('hasFocus', false),
      needsRecovery: false,
    };
  }

  return getDraftEditorSelectionWithNodes(
    editorState,
    root,
    selection.anchorNode,
    selection.anchorOffset,
    selection.focusNode,
    selection.focusOffset,
  );
}

module.exports = getDraftEditorSelection;
