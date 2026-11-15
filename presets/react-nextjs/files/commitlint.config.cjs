// Commit format: type(scope): summary (TICKET). Types come from conventional commits.
// The ticket suffix is a warning, not an error, so housekeeping commits stay possible.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'ticket-suffix': ({ header }) => [
          /\([A-Z][A-Z0-9]+-\d+\)$/.test(header ?? ''),
          'header should end with the ticket key, for example: feat(auth): add refresh (PROJ-123)',
        ],
      },
    },
  ],
  rules: {
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
    'ticket-suffix': [1, 'always'],
  },
};
