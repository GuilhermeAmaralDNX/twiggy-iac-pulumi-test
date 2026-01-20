const aws = require("@pulumi/aws");

async function CreateSgLBInternal(vpc, sgNode,subnet,configuration) {
    const sgAlbInternal = await new aws.ec2.SecurityGroup(`alb-internal`, {
        description: "SG for ECS Internal ALB",
        vpcId: vpc.id,
        tags: {
            Name: `int-${configuration.ecsName}-${configuration.account}-${configuration.region}-alb`,
        },
    });


    const httpsFromWorldToAlbInternal = await new aws.ec2.SecurityGroupRule("httpsFromWorldToAlbInternal", {
        description: "HTTPS ECS Internal ALB",
        type: "ingress",
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        securityGroupId: sgAlbInternal.id,
        cidrBlocks: subnet,
    });

    const httpsTestListenerFromWorldToAlbInternal = await new aws.ec2.SecurityGroupRule("httpsTestListenerFromWorldToAlbInternal", {
        description: "HTTPS ECS Internal ALB Test Listener",
        type: "ingress",
        fromPort: 8443,
        toPort: 8443,
        protocol: "tcp",
        securityGroupId: sgAlbInternal.id,
        cidrBlocks: subnet,
    });


    const fromAlbInternalToEcsNodes = await new aws.ec2.SecurityGroupRule("fromAlbInternalToEcsNodes", {
        description: "Traffic to ECS Nodes",
        type: "egress",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        securityGroupId: sgAlbInternal.id,
        sourceSecurityGroupId: sgNode.id,
    });


    return sgAlbInternal;



}

async function CreateSgLBExternal(vpc, sgNode,configuration) {
    const sgAlb = await new aws.ec2.SecurityGroup("alb-external", {
        description: "SG for ECS ALB",
        vpcId: vpc.id,
        tags: {
            Name: `ext-${configuration.ecsName}-${configuration.account}-${configuration.region}-alb`,
        },
    });

    const httpFromWorldToAlb = await new aws.ec2.SecurityGroupRule("httpFromWorldToAlb", {
        description: "HTTP Redirect ECS ALB",
        type: "ingress",
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        securityGroupId: sgAlb.id,
        cidrBlocks: ["0.0.0.0/0"],
    });


    const httpsFromWorldToAlb = await new aws.ec2.SecurityGroupRule("httpsFromWorldToAlb", {
        description: "HTTPS ECS ALB",
        type: "ingress",
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        securityGroupId: sgAlb.id,
        cidrBlocks: ["0.0.0.0/0"],
    });

    const httpsTestListenerFromWorldToAlb = await new aws.ec2.SecurityGroupRule("httpsTestListenerFromWorldToAlb", {
        description: "HTTPS ECS ALB Test Listener",
        type: "ingress",
        fromPort: 8443,
        toPort: 8443,
        protocol: "tcp",
        securityGroupId: sgAlb.id,
        cidrBlocks: ["0.0.0.0/0"],
    });

    const toEcsNodes = await new aws.ec2.SecurityGroupRule("toEcsNodesALB", {
        description: "Traffic to ECS Nodes",
        type: "egress",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        securityGroupId: sgAlb.id,
        sourceSecurityGroupId: sgNode.id,
    });

    // const httpsFromAlbToWorld = await new aws.ec2.SecurityGroupRule("httpsFromAlbToWorld", {
    //     description: "Traffic from ECS Nodes to HTTPS endpoints",
    //     type: "egress",
    //     fromPort: 443,
    //     toPort: 443,
    //     protocol: "tcp",
    //     securityGroupId: sgAlb.id,
    //     cidrBlocks: ["0.0.0.0/0"],
    // });



    return sgAlb;
}

async function CreateALBInternal(vpc, subnets, sg,configuration) {
    const ecsInternal = await new aws.lb.LoadBalancer("ecsInternal", {
        loadBalancerType: "application",
        internal: true,
        subnets: subnets.ids,
        dropInvalidHeaderFields: true,
        enableDeletionProtection: false,
        securityGroups: [sg.id],
        // accessLogs: {
        //     bucket: '',
        //     prefix:'',
        //     enabled: true
        // }
        idleTimeout: 400,
        tags: {
            Name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}-internal`,
        },
    });

    const tg = await new aws.lb.TargetGroup("ecsDefaultHttpsInternal", {
        port: 80,
        protocol: "HTTP",
        vpcId: vpc.id,
    });


    const ecsHttpsInternal = await new aws.lb.Listener("ecsHttpsInternal", {
        loadBalancerArn: ecsInternal.arn,
        port: 443,
        protocol: "HTTPS",
        sslPolicy: 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
        certificateArn: configuration.certificate,
        defaultActions: [{
            type: "forward",
            targetGroupArn: tg.arn,
        }],
    });

    let indexLst443Int = 0 ;
    for (const cert of configuration.additionalCertificate ) {
        await new aws.lb.ListenerCertificate(`indexLst443Int-${indexLst443Int}`,{
            listenerArn: ecsHttpsInternal.arn,
            certificateArn: cert
        });
        indexLst443Int++;
    }
    
    

    const ecsTestHttpsInternal = await new aws.lb.Listener("ecsTestHttpsInternal", {
        loadBalancerArn: ecsInternal.arn,
        port: 8443,
        protocol: "HTTPS",
        sslPolicy: 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
        certificateArn: configuration.certificate,
        defaultActions: [{
            type: "forward",
            targetGroupArn: tg.arn,
        }],
    });

    let indexLst8443Int = 0 ;
    for (const cert of configuration.additionalCertificate ) {
        await new aws.lb.ListenerCertificate(`indexLst8443Int-${indexLst8443Int}`,{
            listenerArn: ecsTestHttpsInternal.arn,
            certificateArn: cert
        });
        indexLst8443Int++;
    }


    return {
        alb: ecsInternal,
        prodListener: ecsHttpsInternal,
        testListener: ecsTestHttpsInternal
    }
}

async function CreateALB(vpc, subnets, sg,configuration) {
    const alb = await new aws.lb.LoadBalancer("ecs", {
        loadBalancerType: "application",
        internal: false,
        subnets: subnets.ids,
        dropInvalidHeaderFields: true,
        enableDeletionProtection: false,
        securityGroups: [sg.id],
        idleTimeout: 400,
        tags: {
            Name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
        },
    });

    const ecsDefaultHttp = await new aws.lb.TargetGroup("ecsDefaultHttp", {
        port: 80,
        protocol: "HTTP",
        vpcId: vpc.id,
    });

    const ecsDefaultHttps = await new aws.lb.TargetGroup("ecsDefaultHttps", {
        port: 80,
        protocol: "HTTP",
        vpcId: vpc.id,
    });

    const ecsHttps = await new aws.lb.Listener("ecsHttps", {
        loadBalancerArn: alb.arn,
        port: 443,
        protocol: "HTTPS",
        sslPolicy: 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
        certificateArn: configuration.certificate,
        defaultActions: [{
            type: "forward",
            targetGroupArn: ecsDefaultHttps.arn,
        }],
    });

    let indexLst443 = 0 ;
    for (const cert of configuration.additionalCertificate ) {
        await new aws.lb.ListenerCertificate(`indexLst443-${indexLst443}`,{
            listenerArn: ecsHttps.arn,
            certificateArn: cert
        });
        indexLst443++;
    }

    const ecsHttpRedirect = await new aws.lb.Listener("ecsHttpRedirect", {
        loadBalancerArn: alb.arn,
        port: 80,
        protocol: "HTTP",
        defaultActions: [{
            type: "redirect",
            redirect: {
                port: "443",
                protocol: "HTTPS",
                statusCode: "HTTP_301",
            },
        }],
    });


    const ecsTestHttps = await new aws.lb.Listener("ecsTestHttps", {
        loadBalancerArn: alb.arn,
        port: 8443,
        protocol: "HTTPS",
        sslPolicy: 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
        certificateArn: configuration.certificate,
        defaultActions: [{
            type: "forward",
            targetGroupArn: ecsDefaultHttps.arn,
        }],
    });

    let indexLst8443 = 0 ;
    for (const cert of configuration.additionalCertificate ) {
        await new aws.lb.ListenerCertificate(`indexLst8443-${indexLst8443}`,{
            listenerArn: ecsTestHttps.arn,
            certificateArn: cert
        });
        indexLst8443++;
    }


    const ecsTestHttpRedirect = await new aws.lb.Listener("ecsTestHttpRedirect", {
        loadBalancerArn: alb.arn,
        port: 8080,
        protocol: "HTTP",
        defaultActions: [{
            type: "redirect",
            redirect: {
                port: "8443",
                protocol: "HTTPS",
                statusCode: "HTTP_301",
            },
        }],
    });



    return {
        alb: alb,
        prodListener: ecsHttps,
        testListener: ecsTestHttps

    };
}

async function CreateListenersRules(app, listener, tgs,suffix) {

    //for (const app of apps) {
        let hostnamesResolve = app.hostnames;
        if (app.external_hostnames)
            hostnamesResolve = app.hostnames.concat(app.external_hostnames)


        const green = await new aws.lb.ListenerRule(`lr-green-${app.name}${suffix}`, {
            listenerArn: listener.prodListener.arn,

            actions: [{
                type: 'forward',
                targetGroupArn: tgs[`${app.name}-gr`].arn

            }],

            conditions: [{
                pathPattern: {
                    values: app.paths
                }
            },{
                hostHeader: {
                    values: hostnamesResolve
                }
            }],
        }, { ignoreChanges: ['actions'], dependsOn:[tgs[`${app.name}-gr`]] });


        const blue = await new aws.lb.ListenerRule(`lr-blue-${app.name}${suffix}`, {
            listenerArn: listener.testListener.arn,

            actions: [{
                type: 'forward',
                targetGroupArn: tgs[`${app.name}-bl`].arn

            }],

            conditions: [{
                pathPattern: {
                    values: app.paths
                }
            },{
                hostHeader: {
                    values: hostnamesResolve
                }
            }],
        }, { ignoreChanges: ['actions'], dependsOn: [tgs[`${app.name}-bl`]] });

    return {
        green: green,
        blue: blue
    };

}

async function CreateTGBlueGreen(apps,vpc,configuration) {
    let tgs = new Object();
    for (const app of apps) {
        let stickiness = null;
        if (app.stickiness && app.stickiness.enabled === "true") {
            stickiness = {
                type: app.stickiness.type,
                cookieDuration: parseInt(app.stickiness.cookieDuration),
                cookieName: app.stickiness.cookieName ? app.stickiness.cookieName : "",
                enabled: true
            };
        }
        const green = await new aws.lb.TargetGroup(`${configuration.ecsName}-${app.name}-gr`, {
            port: parseInt(app.port),
            protocol: app.protocol,
            vpcId: vpc.id,
            deregistrationDelay: 10,
            targetType: app.launchType == 'FARGATE' ? "ip" : "instance",
            healthCheck: {
                path: app.healthcheckPath,
                interval: 10,
                healthyThreshold: 3,
                unhealthyThreshold: 3,
                timeout: 5,
                matcher: app.healthcheckMatcher,
                protocol: app.protocol,
            },
            stickiness: stickiness
        });

        tgs[`${app.name}-gr`] = green;

        const blue = await new aws.lb.TargetGroup(`${configuration.ecsName}-${app.name}-bl`, {
            port: parseInt(app.port),
            protocol: app.protocol,
            vpcId: vpc.id,
            deregistrationDelay: 10,
            targetType: app.launchType == 'FARGATE' ? "ip" : "instance",
            healthCheck: {
                path: app.healthcheckPath,
                interval: 10,
                healthyThreshold: 3,
                unhealthyThreshold: 3,
                timeout: 5,
                matcher: app.healthcheckMatcher,
                protocol: app.protocol,
            },
            stickiness: stickiness
        });

        tgs[`${app.name}-bl`] = blue;

    }

    return tgs;
}

async function CreateLoadBalance(loadbalancers,vpc,subnetPublic,subnetPrivate) {
    let loadBalancers = [];
    for (const lb of loadbalancers) {
        const sg = await new aws.ec2.SecurityGroup(lb.name, {
            description: `SG ${lb.name}`,
            vpcId: vpc.id,
            tags: {
                Name: lb.name,
            },
        });

        let sgIndex = 0;
        for (const ingress of lb.sgIngressEgress) {
            await new aws.ec2.SecurityGroupRule(`${lb.name}-${sgIndex}`,{
                securityGroupId: sg.id,
                fromPort: ingress.fromPort,
                toPort: ingress.toPort,
                protocol: ingress.protocol,
                type: ingress.type,
                ...(ingress.sourceSecurityGroupId && ({sourceSecurityGroupId: ingress.sourceSecurityGroupId})),
                ...(  ( ingress.cidrBlocks ? ingress.cidrBlocks.length > 0 ? true : false : false   ) &&  ({cidrBlocks: ingress.cidrBlocks}))
            });
            sgIndex++;
        }

        const loadbalancer = await new aws.lb.LoadBalancer(lb.name, {
            name: lb.name,
            loadBalancerType: lb.loadBalancerType,
            internal: lb.internal,
            subnets: lb.subnetType === 'private' ? subnetPrivate: subnetPublic,
            dropInvalidHeaderFields: true,
            enableDeletionProtection: lb.enableDeletionProtection,
            securityGroups: [sg.id],
            idleTimeout: 400,
            tags: {
                Name: lb.name,
            },
        });

        for (const tg of lb.targets) {
            await CreateTarget(lb.name, loadbalancer, vpc, tg);        
        } 

        loadBalancers.push({
            loadbalance: loadbalancer.name,
            type: loadbalancer.loadBalancerType,
            internal: loadbalancer.internal,
            sg: sg.id
        });

    }
    


    // let index = 0;

}

async function CreateTarget(lbName, loadbalancer, vpc, target) {
    if (target.redirect) {
        await new aws.lb.Listener(`${lbName}-${target.name}`, {
            loadBalancerArn: loadbalancer.arn,
            port: target.port,
            protocol: target.protocol,
            defaultActions: [{
                type: "redirect",
                redirect: {
                    port: target.redirect.port,
                    protocol: target.redirect.protocol,
                    statusCode: target.redirect.statusCode,
                },
            }],
        });
    } else {
        const targetGroup = await new aws.lb.TargetGroup(`${lbName}-${target.name}`, {
            name: `${lbName}-${target.name}`,
            port: target.forward.targetPort,
            protocol: target.forward.targetProtocol,
            vpcId: vpc.id,
            ...(target.forward.targetType && {targetType: target.forward.targetType}),                     
        });   
        
        if (target.forward.targetId) {
            await new aws.lb.TargetGroupAttachment(`${lbName}-${target.name}`, {
                targetGroupArn: targetGroup.arn,
                targetId: target.forward.targetId,
            }); 
        }
    
        const listener = await new aws.lb.Listener(`${lbName}-${target.name}`, {
            loadBalancerArn: loadbalancer.arn,
            port: target.port,
            protocol: target.protocol,
            ...(target.certificateArn && {certificateArn: target.certificateArn}),
            defaultActions: [{
                type: "forward",
                targetGroupArn: targetGroup.arn,
            }],
        }); 

        if (target.forward.listenerRules) {
            for (const listenerRule of target.forward.listenerRules) {
                await CreateListenerRules(lbName, vpc, target, listenerRule, listener);
            }            
        }
    }
}

async function CreateListenerRules(lbName, vpc, target, listenerRule, listener) {
    const targetGroup = await new aws.lb.TargetGroup(`${lbName}-${listenerRule.name}`, {
        name: `${lbName}-${listenerRule.name}`,
        port: target.port,
        protocol: target.protocol,
        vpcId: vpc.id,
        deregistrationDelay: 10,
        targetType: listenerRule.targetType,
        healthCheck: {
            matcher: listenerRule.healthCheckMatcher,
            protocol: listenerRule.healthCheckProtocol
        }        
    });

    await new aws.lb.TargetGroupAttachment(`${lbName}-${listenerRule.name}`, {
        targetGroupArn: targetGroup.arn,
        targetId: listenerRule.targetId,
        port: listenerRule.targetPort
    });
    
    let hostnamesResolve = listenerRule.ruleHostnames;
    if (listenerRule.externalHostnames) {
        hostnamesResolve = listenerRule.ruleHostnames.concat(listenerRule.externalHostnames);
    }

    await new aws.lb.ListenerRule(`${lbName}-${listenerRule.name}`, {
        listenerArn: listener.arn,
        actions: [{
            type: "forward",
            targetGroupArn: targetGroup.arn
        }],
        conditions: [{
            pathPattern: {
                values: listenerRule.rulePath
            }                
        },
        {
            hostHeader: {
                values: hostnamesResolve
            }            
        }]
        }
    );    
}

module.exports = {
    CreateSgLBInternal,
    CreateSgLBExternal,
    CreateALBInternal,
    CreateLoadBalance,
    CreateALB,
    CreateTGBlueGreen,
    CreateListenersRules
}