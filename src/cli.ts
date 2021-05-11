import yargs from 'yargs';
import { main } from './index';

yargs
  .usage('tiny-pm <command> [args]')
  .version()
  .alias('v', 'version')
  .help()
  .alias('h', 'help')
  .command(
    'install',
    'Install the dependencies.',
    (argv) => {
      argv.option('production', {
        type: 'boolean',
        description: 'Install production dependencies only.',
      });

      argv.boolean('save-dev');
      argv.boolean('dev');
      argv.alias('D', 'dev');

      return argv;
    },
    main, // eslint-disable-line
  )
  .command(
    '*',
    'Install the dependencies.',
    (argv) =>
      argv.option('production', {
        type: 'boolean',
        description: 'Install production dependencies only.',
      }),
    main, // eslint-disable-line
  )
  .parse();
