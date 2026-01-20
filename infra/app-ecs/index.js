const aws = require("@pulumi/aws");
const fs = require('fs');
const yaml = require('js-yaml');
const cluster = require('./cluster');
const { configuration } = require('./conf');
const { GetOutputs } = require('./output');
const appAlb = require('./appWithALB');
const appWithoutAlb = require('./appWithoutALB');
const appsScheduler = require('./appsScheduler');
const { CreateSSMParameter, CreateSecretManager } = require('./ssm');
const { CreateInstances } = require('./customEC2');
const elastic = require('./elasticcache');
const rds = require('./rds');
const alb = require('./loadbalance');
const s3 = require('./s3');
const sqs = require('./sqs');
const sns = require('./sns');
const {CreateDocDBClusters} = require('./docdb');
const {CreateCustomRoles} = require('./iam')
const ebs = require('./beanstalk');
const redshift = require('./redshift');
const { CreateKMS } = require("./kms");
const amplify = require('./amplify')
const sg = require('./sg');
// const apigateway = require('./apigateway');
const stepFunctions = require("./step-functions");
const dms = require('./dms');
const dynamo = require('./dynamo.js')
const glue = require('./glue');
const lambda = require('./lambda');
const apiGateway = require('./api-custom');
const apigateway = require('./apigateway');
const eventbridge = require('./eventbridge');



module.exports = async () => {

    const outputRoot = await GetOutputs(configuration.pulumiOrg, configuration.account);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;
    configuration.vpnSG = outputRoot.vpnSG.value;


    if (configuration.useDefaultCertificate) {
        configuration.certificate = outputRoot.defaultCertificate.value.arn;
    }

    //console.log(configuration)

    const vpc = await aws.ec2.getVpc({ filters: [{ name: 'tag:Name', values: [`${configuration.account}-VPC`] }] });
    const subnetPublic = await aws.ec2.getSubnets({ filters: [{ name: 'tag:Scheme', values: ['public'] }], vpcId: vpc.id });
    const subnetPrivate = await aws.ec2.getSubnets({ filters: [{ name: 'tag:Scheme', values: ['private'] }], vpcId: vpc.id });
    const subnetSecure = await aws.ec2.getSubnets({ filters: [{ name: 'tag:Scheme', values: ['secure'] }], vpcId: vpc.id });

    let cidrPrivateSubnet = [];
    for (const subId of subnetPrivate.ids) {
        cidrPrivateSubnet.push((await aws.ec2.getSubnet({ id: subId })).cidrBlock)
    }



    let ecs;
    if (configuration.createECS) {
        ecs = await cluster.CreateCluster(
            vpc, subnetPublic,
            subnetPrivate,
            subnetSecure,
            cidrPrivateSubnet,
            configuration);
    
        //Applications with loadbalancer
        const appsECSInput = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/ecs-apps.yaml`, { encoding: 'utf-8' }));
        // Validate that required load balancers are available based on app configuration
        const appsWithALB = appsECSInput.appsWithALB || [];
        const needsExternal = appsWithALB.some(app => app.alb === 'external');
        const needsInternal = appsWithALB.some(app => app.alb === 'internal');

        if (needsExternal && !ecs.loadBalanceExternal) {
            throw new Error('External load balancer required but not initialized. Check configuration.albExternal setting.');
        }
        if (needsInternal && !ecs.loadBalanceInternal) {
            throw new Error('Internal load balancer required but not initialized. Check configuration.albInternal setting.');
        }

        await appAlb.CreateApps(
            ecs.cluster,
            ecs.roleEcsTask,
            ecs.roleEcsService,
            ecs.capacity,
            ecs.gpuCapacity,
            subnetPrivate,
            ecs.sgNodes,
            appsECSInput.appsWithALB || [], // Using appsWithALB instead of apps
            vpc,
            ecs.loadBalanceExternal,  // This should have prodListener
            ecs.loadBalanceInternal,  // This should have prodListener
            ecs.roleCodeDeploy,
            configuration,
            ecs.fileSystem || ecs.efsFileSystem // Support both file system property names
        );

        //Application without loadbalancer
        await appWithoutAlb.CreateApps(
            ecs.cluster,
            ecs.roleEcsTask,
            ecs.capacity,
            ecs.gpuCapacity,
            subnetPrivate,
            ecs.sgNodes,
            appsECSInput.appsWithouthALB,
            configuration
        );
    
        // Applications with scheduler event
        await appsScheduler.CreateApps(
            appsECSInput.appsScheduler,
            ecs.sgNodes,
            subnetPrivate,
            ecs.cluster,
            ecs.roleEcsTask,
            ecs.roleEcsTask,
            configuration
        );
    } else {
        ecs =  {
            sgNodes: ""
        }
    }




    // Create SSM Parameter    // const inputEBS = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/elasticbeanstalk.yaml`, { encoding: 'utf-8' }));
    // const listEbs = await ebs.Create(inputEBS,configuration,subnetPublic,subnetPrivate,vpc,configuration.certificate)
    const ssmInput = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/ssm.yaml`, { encoding: 'utf-8' }));
    const ssmList = await CreateSSMParameter(ssmInput);

    // Create Secret Manager
    const secretInput = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/secret-manager.yaml`, { encoding: 'utf-8' }));
    const secretList = await CreateSecretManager(secretInput);

    // Create SNS
    const inputSNS = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/sns.yaml`, { encoding: 'utf-8' }));
    const snsList = await sns.CreateSNS(inputSNS);

    // Create SQS
    const inputSQS = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/sqs.yaml`, { encoding: 'utf-8' }));
    const sqsList = await sqs.CreateSQS(inputSQS);

    // Create EC2
    const inputEC2 = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/ec2.yaml`, { encoding: 'utf-8' }));
    const instanecs = await CreateInstances(inputEC2, vpc, subnetPrivate.ids[0], subnetPublic.ids[0],configuration,ecs.sgNodes);

    // Create Load Balancers
    const inputLB = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/lb.yaml`, { encoding: 'utf-8' }));
    const lbs = await alb.CreateLoadBalance(inputLB, vpc, subnetPublic.ids, subnetPrivate.ids)

    // Create Redis
    const inputRedis = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/redis.yaml`, { encoding: 'utf-8' }));
    const redis = await elastic.CreateClusterRedis(inputRedis, subnetSecure.ids, vpc.id,configuration,ecs.sgNodes);

    // Create S3
    let s3List = [];
    try {
        const s3YamlPath = `./inputs/${configuration.account}/s3.yaml`;
        if (fs.existsSync(s3YamlPath)) {
            const inputS3 = await yaml.load(await fs.readFileSync(s3YamlPath, { encoding: 'utf-8' }));
            s3List = await s3.CreateS3(inputS3);
        }
    } catch (error) {
        console.log('No S3 configuration found or error loading S3 config:', error.message);
    }

    // Create DOCDB
    const inputDocDB = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/docdb.yaml`, { encoding: 'utf-8' }));
    const DocDBList = await CreateDocDBClusters(inputDocDB,vpc.id,subnetSecure,configuration,ecs.sgNodes);

    //Create RDS
    const inputRDS = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/rds.yaml`, { encoding: 'utf-8' }));
    const rdsDatabases = await rds.Create(inputRDS,vpc,subnetSecure,configuration,ecs.sgNodes, true);

    // Create Custom Role
    const inputIAM = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/iam.yaml`, { encoding: 'utf-8' }));
    const customROles = await CreateCustomRoles(inputIAM);

    // Create Elasticbeanstalk
    const inputEBS = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/elasticbeanstalk.yaml`, { encoding: 'utf-8' }));
    const listEbs = await ebs.Create(inputEBS,configuration,subnetPublic,subnetPrivate,vpc,configuration.certificate,ecs.sgNodes)

    const inputRedShift = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/redshift.yaml`, { encoding: 'utf-8' }));
    const redshiftDatabases = await redshift.Create(inputRedShift,vpc,configuration,ecs.sgNodes,subnetPublic)

    // Create Amplify
    const inputAmplify = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/amplify.yaml`, { encoding: 'utf-8' }));
    await amplify.Create(inputAmplify);
    
    // Create SecurityGroups
    const inputSG = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/sg.yaml`, { encoding: 'utf-8' }));
    await sg.CreateMultipleSGs(inputSG, vpc);

    // Create Step Functions
    const inputStepFunctions = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/step-functions.yaml`, { encoding: 'utf-8' }));
    await stepFunctions.Create(inputStepFunctions, configuration);

    // Create DynamoDB
    const inputDynamo = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/dynamo.yaml`, { encoding: 'utf-8' }));
    await dynamo.Create(inputDynamo);

    // Create DMS
    const inputDMS = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/dms.yaml`, { encoding: 'utf-8' }));
    await dms.Create(subnetPrivate,vpc,inputDMS);

    // Create Glue Resources
    const inputGlue = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/glue.yaml`, { encoding: 'utf-8' }));
    await glue.CreateGlueResources(inputGlue,vpc,subnetPrivate);
    // await glue.Create(inputGlue,vpc,subnetPrivate);

    // Create Lambda
    // for (const lambda of yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/lambdas.yaml`, { encoding: 'utf-8' }))) {
    //     await CreateCustomLambda(lambda,subnetPrivate,vpc);
    // }

    const inputLambda = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/lambdas.yaml`, { encoding: 'utf-8' }));
    await lambda.Create(inputLambda,subnetPrivate,vpc);

    // Create API-Gateway
    const inputapiGateway = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/apigateway.yaml`, { encoding: 'utf-8' }));
    await apigateway.Create(inputapiGateway,subnetPrivate.ids,vpc.id);

    // Create API-Gateway Rest
    const inputapiGatewayRest = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/apigateway-rest.yaml`, { encoding: 'utf-8' }));
    await apigateway.CreateRest(inputapiGatewayRest);


    // Create API-Gateway Custom Domains    
    const inputAPIGatewayCus = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/api-custom.yaml`, { encoding: "utf-8" }));
    await apiGateway.Create(inputAPIGatewayCus);

    const inputEventBridge = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/eventbridge.yaml`, { encoding: 'utf-8' }));
    await eventbridge.Create(inputEventBridge);


    // Create DMS
    // const inputapiGateway = await yaml.load(await fs.readFileSync(`./inputs/${configuration.account}/apigateway.yaml`, { encoding: 'utf-8' }));
    // await apigateway.Create(inputapiGateway);

    //API Gateway
        // if (config.apiGateway.restApis.length > 0) {
        //     await CreateRestApi();
        // }
    
        // return {
        //     efsFilesystemId: ecs.efsFileSystem.id,
        //     accessPoint: ecs.accessPoint,
        //     defaultEcsRoleTaskARN: ecs.roleEcsTask.arn,
        //     securityGroupECSId: ecs.sgNodes.id,
        //     redisednpoints: redis,
        //     instanceRDSEdnpoints: instancesRDS,
        //     instanceAuroraEdnpoints: clustersAurora,
        //     s3List: s3List
    
        // }
}