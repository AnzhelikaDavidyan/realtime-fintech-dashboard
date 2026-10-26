// Commit format:
//   chore: <message>
//   feat(FD-001-n1): <message>
//   fix(FD-001-n1): <message>
const TASK_SCOPE = /^FD-\d{3}-n\d+$/;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'task-scope': ({ type, scope }) => {
          if (type === 'chore') {
            return [!scope, 'chore commits take no scope: "chore: <message>"'];
          }
          return [
            !!scope && TASK_SCOPE.test(scope),
            `${type} commits need a task scope like "${type}(FD-001-n1): <message>"`,
          ];
        },
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', ['chore', 'feat', 'fix']],
    'scope-case': [0],
    'scope-empty': [0],
    'task-scope': [2, 'always'],
  },
};
