import extendedEnv from 'dotenv-extended';

const options = {
    silent: false,
    defaults: './src/config/.env.defaults',
    schema: './src/config/.env.schema',
    path: `./src/config/.env.${process.env.NODE_ENV?.split(' ').join('')}`,
    includeProcessEnv: true,
    assignToProcessEnv: true,
    overrideProcessEnv: false
}

const config = extendedEnv.load(options)

export default config