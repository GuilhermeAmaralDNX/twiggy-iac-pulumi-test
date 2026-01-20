const pulumi = require('@pulumi/pulumi');
const config = new pulumi.Config();
const configuration = config.requireObject('configuration')

module.exports = {
    configuration
} 
