const React = require('react');

const SvgMock = React.forwardRef((props, ref) =>
  React.createElement('svg', { ...props, ref }),
);
SvgMock.displayName = 'SvgMock';

module.exports = { default: 'test-file-stub', ReactComponent: SvgMock };
