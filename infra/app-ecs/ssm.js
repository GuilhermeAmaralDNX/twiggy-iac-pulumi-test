
const aws = require("@pulumi/aws");

async function CreateSSMParameter(ssmParameter) {
    
	// let index = 0;
    for (const parameter of ssmParameter) {
        new aws.ssm.Parameter(parameter,{
            type: 'SecureString',
            value: '-',
            name: parameter
        },{ignoreChanges:['value']});
		// index++;
    }

}

async function CreateSecretManager(secretManager) {
    // let index = 0;
    for (const secret of secretManager) {
        new aws.secretsmanager.Secret(secret,{
            name: secret,
        });
		// index++;
    }
}

module.exports = {
    CreateSSMParameter,
    CreateSecretManager
}
