const css = require('./view.css');
const { createWanObserverPage } = require('./src/app/WanObserverPage');

// SDK4 evaluates this CommonJS export inside the existing Vue 2 admin layout.
module.exports = createWanObserverPage(css);
