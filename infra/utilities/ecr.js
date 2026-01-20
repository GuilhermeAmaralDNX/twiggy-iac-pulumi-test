const aws = require("@pulumi/aws");


async function CreateECRREpo(configuration) {
    for (const repo of configuration.ecrREpos) {   
        const ecr = await new aws.ecr.Repository(repo,{name:repo,imageScanningConfiguration: {
            scanOnPush: true
        }});
         await CreateRepoRepolicy(repo,ecr,configuration);
    }
}

async function CreateRepoRepolicy(repo,ecr,configuration) {

    let accounts = [];
    for (const account of configuration.ecrTrustAccounts) {
        accounts.push(`arn:aws:iam::${account}:root`)
    }


const current = await aws.getCallerIdentity();


const policyDoc = await aws.iam.getPolicyDocument({
  version: '2008-10-17',
  statements: [
    {
      sid: 'AllowWriteMgmt',
      effect: 'Allow',
      principals: [{
        type: 'AWS',
        identifiers:[`arn:aws:iam::${current.accountId}:root`]
      }],
      actions:[
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ]
    },
    {
      sid: 'AllowPull',
      effect: 'Allow',
      principals: [{
        type: 'AWS',
        identifiers: accounts
      }],
      actions: [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "ecr:DescribeImageScanFindings"
      ]
    }
  ]
})

const policy = await new aws.ecr.RepositoryPolicy(repo, {
    repository: repo,
    policy: policyDoc.json
},{dependsOn:[ecr]});

}


module.exports = {
    CreateECRREpo
}