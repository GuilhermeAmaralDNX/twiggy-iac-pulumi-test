"use strict";
const {configuration} = require('./conf');
const {GetOutputRoot} = require('./output');
const {CreateVPC, CreateInternetGateway, EnableVPCFLowLogs, CreateVpcEndpointS3, CreateVpcEndpointLambda} = require('./vpc');
const {CretaeDBSubnet, CreateElasticIP, CreateSubnetPublic, CreateNatGateway, CreateSubnetPrivate, CreateSubnetSecure,ConfigureRouteTablePrivate, CreateNatInstance } = require('./subnets');
const { CreateNaclPublic, CreateNaclSecure, CreateNaclPrivate} = require('./nacl');
const {CreateDomain} = require('./domain');

module.exports = async() => {

    const outputRoot = await GetOutputRoot(configuration.pulumiOrg);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;

    const vpc = await CreateVPC(configuration);

    const ig = await CreateInternetGateway(vpc,configuration);

    if(configuration.enableFlowLogs)
        await EnableVPCFLowLogs(vpc,configuration);

    const endpointS3 = await CreateVpcEndpointS3(vpc,configuration);

    const endpointLambda = await CreateVpcEndpointLambda(vpc,configuration);

    const subnetPublic = await CreateSubnetPublic(vpc,ig,endpointS3,configuration);

    const eips = await CreateElasticIP(configuration);

    const subnetPrivate = await CreateSubnetPrivate(vpc,ig,endpointS3,"nats",configuration,endpointLambda);
    
    let nats;
    let nic;
    // //Create Nat-Gateway or Nat-instance
     if (configuration.createNatGateway) 
         nats = await CreateNatGateway(eips,subnetPublic,configuration);
     else
         nic = await CreateNatInstance(eips,subnetPublic,subnetPrivate,configuration,vpc);


    await ConfigureRouteTablePrivate(configuration,vpc,nic,subnetPrivate,endpointS3,nats,endpointLambda);

    const subnetSecure = await CreateSubnetSecure(vpc,endpointS3,configuration);

    await CretaeDBSubnet(subnetSecure,configuration);

    await CreateNaclPublic(vpc,subnetPublic,subnetPrivate,configuration);

    await CreateNaclSecure(vpc,subnetSecure,subnetPrivate,configuration);

    await CreateNaclPrivate(vpc,subnetPrivate,subnetPublic,subnetSecure,configuration);

    const domains = await CreateDomain(vpc,configuration);

    return {
        defaultDomain: domains[0],
        domains: domains,
        publicOutboundIps: eips,
        vpc: vpc,
        publicSubnet: subnetPublic,
        subnetPrivate: subnetPrivate,
        subnetSecure: subnetSecure,
    }

}

