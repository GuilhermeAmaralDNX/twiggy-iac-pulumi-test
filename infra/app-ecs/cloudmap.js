const aws = require("@pulumi/aws");


async function CreateCloudMap(ecsName,vpc) {
    const cloudmap = await new aws.servicediscovery.PrivateDnsNamespace(ecsName,{
        vpc: vpc.id,
        name: ecsName,
    })

    return cloudmap;

}    

async function CreateServiceDiscovery(namespace,app) {
    const serviceDiscoverySvc = await new aws.servicediscovery.Service(`ecs-${app}`, {
        dnsConfig: {
            dnsRecords: [
                {
                    ttl: 10,
                    type: "A",
                }
            ],
            namespaceId: namespace.id,
            routingPolicy: 'MULTIVALUE'
        },
        // healthCheckCustomConfig: {
        //     failureThreshold: 1,
        // },
        name: app,
    });

    return serviceDiscoverySvc;
}

module.exports = {
    CreateCloudMap,
    CreateServiceDiscovery
}