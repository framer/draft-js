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

var React = require('react');

/**
 * A DraftDecorator is a strategy-component pair intended for use when
 * rendering content.
 *
 *   - A "strategy": A function that accepts a ContentBlock object and
 *     continuously executes a callback with start/end values corresponding to
 *     relevant matches in the document text. For example, getHashtagMatches
 *     uses a hashtag regex to find hashtag strings in the block, and
 *     for each hashtag match, executes the callback with start/end pairs.
 *
 *   - A "component": A React component that will be used to render the
 *     "decorated" section of text.
 *
 *   - "props": Props to be passed into the React component that will be used.
 */


/**
 * DraftDecoratorComponentProps are the core set of props that will be
 * passed to all DraftDecoratorComponents if a Custom Block Component is not used.
 * Note that a component may also accept additional props outside of this list.
 */