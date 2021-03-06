function getSelection() {
  let domSelection = global.getSelection();

  // Check for Shadow DOM grand child selection (global returns empty in this case)
  if (
    domSelection.anchorNode &&
    domSelection.anchorNode.childNodes.length &&
    domSelection.anchorNode.childNodes[0].shadowRoot // TODO: check other cases
  ) {
    domSelection = domSelection.anchorNode.childNodes[0].shadowRoot.getSelection();
  }
  console.log('getSelection');
  return domSelection;
}

module.exports = getSelection;
