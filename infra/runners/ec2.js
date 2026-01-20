const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');
const fs = require('fs');
const { render, renderFile } = require('template-file');
const { GetSubnets, GetVPC } = require('./vpc');


async function RenderTemplateFiles(runnerType,githubToken,bitbucketConfig,githubOrg,name,githubLabels,pulumiToken) {

    let runnerConfigRender;
    switch (runnerType) {
        case 'bitbucket':
            runnerConfigRender = await renderFile('./templates/runner-config-bitbucket.tpl',bitbucketConfig);        
            break;
        case 'github':
            runnerConfigRender = await renderFile('./templates/runner-config-github.tpl',{token: githubToken, github_org: githubOrg, account_name: name, labels: githubLabels, tokenpulumi: pulumiToken});
            break;
        default:
            break;
    }
    

    return runnerConfigRender;

}

async function GetAMIRunner() {
    const image = await aws.ec2.getAmi({
        mostRecent: true,
        filters: [
            {
                name: 'name',
                values: ['ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*']
            },
            {
                name: 'architecture',
                values: ['x86_64']
            },
            {
                name: 'virtualization-type',
                values: ['hvm']
            }
        ],
        owners: ['099720109477'] // ID da Canonical para AMIs oficiais do Ubuntu
    });
    return image;
}

async function CreateLaunchTemplateRunnerInstance(profile, sgRunner, ami,runnerType,githubToken,bitbucketConfig,githubOrg,name,githubLabels,pulumiToken,configuration) {

    const image = ami;
    const userData = await RenderTemplateFiles(runnerType,githubToken,bitbucketConfig,githubOrg,name,githubLabels,pulumiToken);

    const template = await new aws.ec2.LaunchTemplate(`${configuration.name}-runner-instance`, {
        namePrefix: `${configuration.name}-runner`,
        imageId: image.id,

        instanceType: configuration.instanceTypes[0].instanceTypes,
        ebsOptimized: true,
        iamInstanceProfile: {
            name: profile
        },
        blockDeviceMappings: [{
            deviceName: '/dev/sda1',
            ebs: {
                volumeSize: '100',
                volumeType: 'gp3',
                deleteOnTermination: true,
            }
        }],
        userData: Buffer.from(userData).toString('base64'),
        networkInterfaces: [{
            associatePublicIpAddress: false,
            securityGroups: [sgRunner.id]
        }]

    });

    return template;
}

async function CreateASGRunnerInstance(subnets, template,configuration) {
    const asg = await new aws.autoscaling.Group(`${configuration.name}-as-group`, {
        name: `${configuration.name}-as-group`,
        vpcZoneIdentifiers: subnets.ids,
        minSize: 1,
        maxSize: 1,        
        desiredCapacity: 1,
        healthCheckGracePeriod: 0,
        mixedInstancesPolicy: {
            launchTemplate: {
                launchTemplateSpecification: {
                    launchTemplateId: template.id,
                    version: '$Latest'
                },
                overrides: configuration.instanceTypes,
            },
            instancesDistribution: {
                onDemandPercentageAboveBaseCapacity: 0,
                onDemandBaseCapacity: 0,
                spotInstancePools: 3       
            },
        },
        tags: [{
            key: 'Name',
            value: `${configuration.name}-runner`,
            propagateAtLaunch: true

        }]
    });
}

module.exports = {
    GetAMIRunner,
    CreateLaunchTemplateRunnerInstance,
    CreateASGRunnerInstance

}