export default {
  transform: {
    '^.+\\.js$': ['babel-jest', { presets: ['@babel/preset-env'] }],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json'],
}; 