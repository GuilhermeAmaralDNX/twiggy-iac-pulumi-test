const aws = require('@pulumi/aws');

async function EncryptionByDefaultEBS() {

}
async function EncryptionByDefaultEBS() {

    await new aws.ebs.EncryptionByDefault(`EncryptionByDefault`,
        {
            enabled: true
        });
}

module.exports = { EncryptionByDefaultEBS }
