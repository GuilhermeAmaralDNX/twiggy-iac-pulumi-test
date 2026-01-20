const codedeploy = require('./codedeploy');
const ecs = require('./ecs');
const alb = require('./loadbalance');
const asg = require('./asg');
const ec2 = require('./ec2');
const efs = require('./efs');
const { CreateKMS } = require('./kms');


async function CreateCluster(vpc,subnetPublic,subnetPrivate,subnetSecure,subnetPrivateCidr,configuration) {

    let roleEcs;
    let sgAlbExternal;
    let sgAlbInternal;
    let loadBalanceExternal;
    let loadBalanceInternal;
    let template;
    let autoScale;
    let capacity;
    let gpuTemplate;
    let gpuAutoScale;
    let gpuCapacity;

    const kms = await CreateKMS(configuration);
    const roleCodeDeploy = await codedeploy.CreateIAM(configuration);
    const roleEcsTask = await ecs.CreateIAMEcsTask(configuration);
    const roleEcsService = await ecs.CreateIAMEcsServer(configuration);

    if (!configuration.isFargate || !configuration.isFargateOnly)
        roleEcs = await ecs.CreateIAMECS(kms,configuration)

    const sgNodes = await ecs.CreateSG(vpc,configuration);

    const sgEFS = await efs.CreateSG(vpc, sgNodes,configuration)
    const efsFileSystem = await efs.CreateEFS(kms,configuration);
    await efs.CreateMountTarget(efsFileSystem, subnetSecure, sgEFS);
    const accessPoint = await efs.CreateAccessPoints(efsFileSystem,configuration);

    // Check if we need load balancers based on the apps configuration
    if (configuration.albExternal) {
        sgAlbExternal = await alb.CreateSgLBExternal(vpc, sgNodes, configuration);
        loadBalanceExternal = await alb.CreateALB(vpc, subnetPublic, sgAlbExternal, configuration);
        if (!loadBalanceExternal || !loadBalanceExternal.prodListener) {
            throw new Error('Failed to initialize external load balancer');
        }
    }

    if (configuration.albInternal) {
        sgAlbInternal = await alb.CreateSgLBInternal(vpc, sgNodes, subnetPrivateCidr, configuration);
        loadBalanceInternal = await alb.CreateALBInternal(vpc, subnetPrivate, sgAlbInternal, configuration);
        if (!loadBalanceInternal || !loadBalanceInternal.prodListener) {
            throw new Error('Failed to initialize internal load balancer');
        }
    }

    await ecs.CreateRuleSGLoadBalance(sgNodes, sgAlbExternal, sgAlbInternal,configuration);

    if (!configuration.isFargate || !configuration.isFargateOnly) {
        template = await ec2.CreateLaunchTemplate(roleEcs, efsFileSystem, sgNodes, kms,configuration);
        autoScale = await asg.CreateASG(template, subnetPrivate,configuration);
        capacity = await asg.CreateECSCapacityProvider(autoScale,configuration);

    }

    // Create GPU capacity provider if enabled
    if (configuration.gpuCapacityProvider && configuration.gpuCapacityProvider.enabled) {
        gpuTemplate = await ec2.CreateGpuLaunchTemplate(roleEcs, efsFileSystem, sgNodes, kms, configuration);
        gpuAutoScale = await asg.CreateGpuASG(gpuTemplate, subnetPrivate, configuration);
        gpuCapacity = await asg.CreateGpuECSCapacityProvider(gpuAutoScale, configuration);
    }

    const cluster = await ecs.CreateECS(capacity, gpuCapacity, configuration);

    if ( (configuration.scheduler.enabled && !configuration.isFargate) || !configuration.isFargateOnly )
        await asg.CreateScheduler(autoScale, cluster,configuration);


    return {
        cluster: cluster,
        roleCodeDeploy: roleCodeDeploy,
        roleEcsTask: roleEcsTask,
        roleEcsService: roleEcsService,
        loadBalanceInternal: loadBalanceInternal,
        loadBalanceExternal: loadBalanceExternal,
        template: template,
        autoScale: autoScale,
        capacity: capacity,
        gpuTemplate: gpuTemplate,
        gpuAutoScale: gpuAutoScale,
        gpuCapacity: gpuCapacity,
        sgNodes: sgNodes,
        accessPoint: accessPoint,
        efsFileSystem: efsFileSystem
    }

}

module.exports = {
    CreateCluster
}