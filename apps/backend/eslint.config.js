import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'src/klima/vendor/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Prefer unknown over any; allow when typing external SDK shapes is painful.
      '@typescript-eslint/no-explicit-any': 'off',
      // Ban `as T` / angle-bracket assertions. `as const` remains allowed.
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      // Widen `as const` arrays to string[] so `.includes(string)` typechecks —
      // erases the literal union. Use `.some((x) => x === value)` instead.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSAsExpression[typeAnnotation.type="TSArrayType"][typeAnnotation.elementType.type="TSStringKeyword"]',
          message:
            'Do not cast to string[]. Keep as-const arrays typed; use .some((x) => x === value) for membership checks.',
        },
        {
          selector:
            'TSAsExpression[typeAnnotation.type="TSTypeOperator"][typeAnnotation.operator="readonly"][typeAnnotation.typeAnnotation.type="TSArrayType"][typeAnnotation.typeAnnotation.elementType.type="TSStringKeyword"]',
          message:
            'Do not cast to readonly string[]. Keep as-const arrays typed; use .some((x) => x === value) for membership checks.',
        },
      ],
    },
  },
)
