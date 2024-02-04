module.exports = {
    // other config options here
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
        '^.+\\.jsx?$': 'babel-jest',
        '^.+\\.js?$': 'babel-jest',
    },
    testMatch: ['**/tests/**/*.+(ts|tsx|js)'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    // add the following to support ES6 modules
    transformIgnorePatterns: ['<rootDir>/node_modules/(?!(module-that-needs-to-be-transpiled)/)'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
}