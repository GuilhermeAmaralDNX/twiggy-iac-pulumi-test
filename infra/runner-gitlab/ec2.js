const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');
const fs = require('fs');
const {render,renderFile} = require('template-file');
const config = require('./conf.js');
const { GetSubnets, GetVPC } = require('./vpc');



async function RenderTemplateFiles(
                                  cacheBucket,
                                  runnerAMI,
                                  sgRunnerId,
                                  profileRunner,
                                  sgGitlabRunnerId,
                                  vpcId,
                                  subnetId,configuration) {

    let runnerConfigValues = configuration.runnerConfig;

    // await pulumi.all([cacheBucket,vpcId,subnetId,runnerAMI,sgRunnerId,profileRunner]).apply(([cacheBucket,vpcId,subnetId,runnerAMI,sgRunnerId,profileRunner]) => {
    //     console.log("bucket_name: ", cacheBucket);
    //     console.log("runners_vpc_id: ", vpcId);
    //     console.log("runners_subnet_id:", subnetId);
    //     console.log("runners_ami: ", runnerAMI);
    //     console.log("runners_security_group_name:", sgRunnerId);
    //     console.log("runners_instance_profile: ", profileRunner);
    // });

    // await pulumi.all([cacheBucket,vpcId,subnetId,runnerAMI,sgRunnerId,profileRunner]).apply(() => {
    //     runnerConfigValues.bucket_name = cacheBucket;
    //     runnerConfigValues.runners_vpc_id = vpcId;
    //     runnerConfigValues.runners_subnet_id = subnetId;
    //     runnerConfigValues.runners_ami = runnerAMI;
    //     runnerConfigValues.runners_security_group_name = sgRunnerId;
    //     runnerConfigValues.runners_instance_profile = profileRunner;
    // });

            
    const runnerConfigRender = await renderFile('./templates/runner-config.tpl', runnerConfigValues);

    
    let gitlabRunnerValues = configuration.gitlabRunnerConfig;
    gitlabRunnerValues.runners_config = runnerConfigRender;

    await pulumi.all([sgGitlabRunnerId]).apply(([sgGitlabRunnerId]) => {
        gitlabRunnerValues.runners_security_group_id = sgGitlabRunnerId;
    });
    const gitlabRunnerRender = await renderFile('./templates/gitlab-runner.tpl',gitlabRunnerValues);
    
    let userDataValues = configuration.userDataConfig;
    userDataValues.gitlab_runner = gitlabRunnerRender;
    const userDataRender = await renderFile('./templates/user-data.tpl',userDataValues);

    return  {
        runnerConfigRender: runnerConfigRender,
        gitlabRunnerRender: gitlabRunnerRender,
        userDataRender: userDataRender
    }
}

async function CreateSSMToken(configuration) {
    const ssm = await new aws.ssm.Parameter(`${configuration.name}-runner-token`,{
        name: `${configuration.name}-runner-token`,
        type: 'SecureString',
        value: 'null',
    },{
        ignoreChanges: ['value']
    });
    return ssm;
}

async function GetAMIDockerMachine() {
    const image = await
        aws.ec2.getAmi({
            mostRecent: true,
            filters: [
                {
                    name: 'name', values: ['amzn2-ami-hvm-2.*-x86_64-ebs']
                },
                {
                    name: 'architecture', values: ['x86_64']
                }
            ], owners: ['amazon']
    })
    return image;
}

async function GetAMIRunner() {
    const image = await
        aws.ec2.getAmi({
            mostRecent: true,
            filters: [
                {
                    name: 'name', values: ['ubuntu/images/hvm-ssd/ubuntu-bionic-18.04-amd64-server-*']
                },
                {
                    name: 'architecture', values: ['x86_64']
                }
            ], owners: ['099720109477']
    })
    return image;
}

async function CreateLaunchTemplateRunnerInstance(profile,sgRunner,userData, ami,configuration) {

    const image = ami;

    const template = await new aws.ec2.LaunchTemplate(`${configuration.name}-runner-instance`,{
        namePrefix: `${configuration.name}-runner-instance-`,
        imageId: image.id,
        instanceType: configuration.instanceType,
        ebsOptimized: true,
        iamInstanceProfile: {
            name: profile.name
        },
        userData: Buffer.from(userData).toString('base64'),
        networkInterfaces: [{
            associatePublicIpAddress: false,
            securityGroups: [sgRunner.id]
        }]

    });

    return template;
}

async function CreateASGRunnerInstance(subnets,template,configuration) {
    const asg  = await new aws.autoscaling.Group(`${configuration.name}-as-group`,{
        name: `${configuration.name}-as-group`,
        vpcZoneIdentifiers: subnets.ids,
        minSize: 1,
        maxSize: 1,
        desiredCapacity: 1,
        healthCheckGracePeriod: 0,
        mixedInstancesPolicy : {
            launchTemplate: {
                launchTemplateSpecification: {
                    launchTemplateId: template.id,
                    version: '$Latest'
                },
                overrides: [
                {
                    instanceType: 't3.micro'
                },
                {
                    instanceType: 't3.small'
                },
                {
                    instanceType: 't2.micro'
                }
            ]
            },
            instancesDistribution: {
                onDemandPercentageAboveBaseCapacity: 100,
            },
        },
        tags: [{
            key: 'Name',
            value: `${configuration.name}-runner-instance`,
            propagateAtLaunch: true

        }]
    });
}

module.exports = {
    RenderTemplateFiles,
    CreateSSMToken,
    CreateLaunchTemplateRunnerInstance,
    CreateASGRunnerInstance,
    GetAMIRunner,
    GetAMIDockerMachine
}