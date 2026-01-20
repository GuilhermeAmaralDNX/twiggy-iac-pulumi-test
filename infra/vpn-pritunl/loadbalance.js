const aws = require("@pulumi/aws");

async function CreateSG(name,vpc,internetAccess,ingressRules) {
    const sg = await new aws.ec2.SecurityGroup(`${name}`,{
        vpcId: vpc,
        name: `${name}-sg`,        
    });

    if (internetAccess) 
        await new aws.ec2.SecurityGroupRule(`${name}-internet`,{
            securityGroupId: sg.id,
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            type: 'egress',     
            cidrBlocks: ['0.0.0.0/0']       
        });

    let sgIndex = 0;
    for (const ingress of ingressRules) {
        await new aws.ec2.SecurityGroupRule(`${name}-${sgIndex}`,{
            securityGroupId: sg.id,
            fromPort: parseInt(ingress.fromPort),
            toPort: parseInt(ingress.toPort),
            protocol: ingress.protocol,
            type: 'ingress',
            ...(ingress.sourceSecurityGroupId && ({sourceSecurityGroupId: ingress.sourceSecurityGroupId})),
            ...(  ( ingress.cidrBlocks ? ingress.cidrBlocks.length > 0 ? true : false : false   ) &&  ({cidrBlocks: ingress.cidrBlocks}))
        });
        sgIndex++;
    }

return sg;

}

async function CreateLB(lb,sg,subnets,vpc) {
    const nlb = await new aws.alb.LoadBalancer(lb.name,{
        name: lb.name,
        loadBalancerType: lb.loadBalancerType,
        ...( (lb.loadBalancerType === 'network') && {enableCrossZoneLoadBalancing: lb.enableCrossZoneLoadBalancing}),
        ...( (!lb.loadBalancerType === 'network') && {securityGroups: [sg]}),
        subnets: subnets,
        tags: {
            Name: lb.name,
            Environment: lb.env
        }

    });

    let index = 0;
    for (const target of lb.targets) {
        const targetGroup = await new aws.lb.TargetGroup(`${index}-${lb.name}`, {
            port: target.targetPort,
            protocol: target.targetProtocol,
            vpcId: vpc,
            targetType: target.targetType
        });   
         
        const targetGroupAttachment = await new aws.lb.TargetGroupAttachment(`${index}-${lb.name}`, {
            targetGroupArn: targetGroup.arn,
            targetId: target.targetId,
        }); 
    
        const listener = await new aws.lb.Listener(`${index}-${lb.name}`, {
            loadBalancerArn: nlb.arn,
            port: target.targetPort,
            ...(target.listenerProtocol === "TLS" && {certificateArn: target.certificateArn}),
            protocol: target.listenerProtocol,
            defaultActions: [{
                type: "forward",
                targetGroupArn: targetGroup.arn,
            }],
        });        
        index++;
    }

    // //Redirect to HTTPS for Frontend
    // const httpListener = await new aws.lb.Listener("httpListener", {
    //     loadBalancerArn: nlb.arn,
    //     port: 80,
    //     protocol: 'TCP',
    //     defaultActions: [{
    //         type: "redirect",
    //         redirect: {
    //             port: "443",
    //             protocol: "HTTPS",
    //             statusCode: "HTTP_301",
    //         },
    //     }],
    // });

    return nlb;

}

async function CreateLBs(lb,vpc,subnets) {
        let sg;
        const nlb = await CreateLB(lb,sg,subnets,vpc);
        return nlb;
    
}

module.exports = {
    CreateLBs
}