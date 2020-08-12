module.exports = {
    env: {
        es2020: true,
        node: true,
    },
    extends: [
        'airbnb-base',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 11,
    },
    plugins: [
        '@typescript-eslint',
    ],
    rules: {
        'comma-dangle': [ 'error', 'never' ],
        'indent': [ 'error', 4 ],
        'padded-blocks': 0,
        'lines-between-class-members': 0,
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'error',
        'max-len': 0
    }
};
