const pulumi = require('@pulumi/pulumi');
const config = new pulumi.Config();
let configuration = config.requireObject('configuration');

module.exports = {
    configuration
} 
