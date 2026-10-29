import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      /* O argsIgnorePattern existe pelo mesmo motivo do varsIgnorePattern, que
         ja estava aqui: sem o eslint-plugin-react, identificador usado so em
         JSX nao conta como uso. Entao `({ icon: Icon })` virava "nunca usado"
         mesmo com <Icon /> tres linhas abaixo, e varsIgnorePattern nao pegava
         o caso porque parametro desestruturado e argumento, nao variavel.

         A alternativa era instalar o eslint-plugin-react so pelo
         jsx-uses-vars. Nao paga uma dependencia nova: a convencao de que
         maiuscula inicial significa componente ja vale no projeto todo. */
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]',
      }],
    },
  },
])
