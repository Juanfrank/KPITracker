import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  },
  {
    // El dominio debe permanecer puro: sin dependencias de otras capas ni de librerías de UI/IO.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@application/*', '@infrastructure/*', '@renderer/*', 'electron', 'react', 'zustand', '@duckdb/*'] }
          ]
        }
      ]
    }
  },
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'coverage/**'] }
);
