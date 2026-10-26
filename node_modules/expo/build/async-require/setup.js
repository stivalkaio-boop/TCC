// NOTE(@kitten): This module is used in Node contexts, e.g. via jest-expo
// Only during development.
if (__DEV__ && // Disable for SSR
typeof window !== 'undefined') {
    require('./setupFastRefresh');
    require('./setupHMR');
    require('./messageSocket');
}

//# sourceMappingURL=setup.js.map
