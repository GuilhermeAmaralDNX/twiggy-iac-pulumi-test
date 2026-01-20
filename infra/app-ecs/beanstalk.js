const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");
const {CreateRecordExternal} = require('./route53');

async function CreateALB(subnets,sg,configuration) {
    const alb = await new aws.lb.LoadBalancer("ebs", {
        loadBalancerType: "application",
        internal: false,
        subnets: subnets.ids,
        dropInvalidHeaderFields: true,
        enableDeletionProtection: false,
        securityGroups: [sg.id],
        idleTimeout: 400,
        tags: {
            Name: `ebs-shared-${configuration.account}-${configuration.region}`,
        },
    });

    await new aws.lb.Listener("ebsHttpRedirect", {
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

     await new aws.lb.Listener("ebsHttps", {
        loadBalancerArn: alb.arn,
        port: 443,
        protocol: "HTTPS",
        sslPolicy: 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
        certificateArn: configuration.certificate,
        defaultActions: [{
            type: "fixed-response",
            fixedResponse: {
                contentType: 'text/plain',
                messageBody: 'No content :)',
                statusCode: "200"
            }
        }],
    });

    // await new aws.lb.Listener("ebsHttpRedirect", {
    //     loadBalancerArn: alb.arn,
    //     port: 443,
    //     defaultActions: [{
    //         fixedResponse
    //     }]
    // });


    return alb;
}

// async function CreateIAMRoleEBS(name,) {
//     const role = await new aws.iam.Role(`ebs-role-${name}`, {
//         name: `ebs-role-${name}`,
//         assumeRolePolicy: {
//             Version: '2012-10-17',
//             Statement: [{
//                 Effect: 'Allow',
//                 Action: 'sts:AssumeRole',
//                 Principal: {
//                     Service: ['elasticbeanstalk.amazonaws.com']
//                 }
//             }],
//         }

//     });




// }

async function CreateIAMRole(name,managedPolicies,permissions) {
    const role = await new aws.iam.Role(`ebs-${name}`, {
        name: name,
        assumeRolePolicy: {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Action: 'sts:AssumeRole',
                Principal: {
                    Service: ['ec2.amazonaws.com']
                }
            }]
        }

    });

    if (permissions.length > 0) {
        const customPolicy = await new aws.iam.Policy(`pol-${name}`, {
            policy: JSON.stringify({
                "Version": "2012-10-17",
                "Statement": permissions
            })
        });

        await new aws.iam.RolePolicyAttachment(`attach-pol-${name}`, {
            role: role.name,
            policyArn: customPolicy.arn,
        });

    }


    let indexManaged = 0;
    for (const managedPolicy of managedPolicies) {
        await new aws.iam.RolePolicyAttachment(`${name}-${indexManaged}`, {
            role: role.name,
            policyArn: managedPolicy,
        })
        indexManaged++;
    }

    let attachIndex = 0;
    const roleInstanceProfile = await new aws.iam.InstanceProfile(`${name}-${attachIndex}`, {
        name: name,
        role: role.name
    });


    return {
        role: role,
        instanceProfile: roleInstanceProfile
    }


}

async function CreateSGEc2(name,vpc,vpnAccess,configuration,ingressRules,egressRules,sgAlb,appPort,appProtocol,sgApps) {
    const sg = await new aws.ec2.SecurityGroup(name, {
        name: name,
        vpcId: vpc,
    });


    if (vpnAccess)
        await new aws.ec2.SecurityGroupRule(`ebsv-${name}`, {
            description: "Traffic Ingress VPN",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: configuration.vpnSG
        });



    if (appsAccess)
        await new aws.ec2.SecurityGroupRule(`ebsa-${name}`, {
            description: "Traffic Ingress APPS",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: sgApps
        })


    await new aws.ec2.SecurityGroupRule(`${name}-internet`, {
        securityGroupId: sg.id,
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        type: 'egress',
        cidrBlocks: ['0.0.0.0/0']
    });

    await new aws.ec2.SecurityGroupRule(`${name}-ing-alb`, {
        securityGroupId: sg.id,
        protocol: "TCP",
        fromPort: appPort,
        toPort: appPort,
        type: 'ingress',
        sourceSecurityGroupId: sgAlb
    });    

    if (vpnAccess)
        await new aws.ec2.SecurityGroupRule(`ebvpn-${name}`, {
            description: "Traffic Ingress VPN",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: configuration.vpnSG
        });

        let sgIndex = 0;
        for (const ingress of ingressRules) {
            await new aws.ec2.SecurityGroupRule(`${name}-${sgIndex}`, {
                securityGroupId: sg.id,
                fromPort: ingress.fromPort,
                toPort: ingress.toPort,
                protocol: ingress.protocol,
                type: 'ingress',
                ...(ingress.sourceSecurityGroupId && ({ sourceSecurityGroupId: ingress.sourceSecurityGroupId })),
                ...((ingress.cidrBlocks ? ingress.cidrBlocks.length > 0 ? true : false : false) && ({ cidrBlocks: ingress.cidrBlocks }))
            });
            sgIndex++;
        }
    
        return sg;        

}

async function CreateSGALB(nameEnvironment,vpc) {
    const sg = await new aws.ec2.SecurityGroup(nameEnvironment, {
        name: nameEnvironment,
        vpcId: vpc,
    });

    const httpFromWorldToAlb = await new aws.ec2.SecurityGroupRule("ebs-http", {
        description: "HTTP Redirect EBS ALB",
        type: "ingress",
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
        securityGroupId: sg.id,
        cidrBlocks: ["0.0.0.0/0"],
    });


    const httpsFromWorldToAlb = await new aws.ec2.SecurityGroupRule("ebs-https", {
        description: "HTTPS EBS ALB",
        type: "ingress",
        fromPort: 443,
        toPort: 443,
        protocol: "tcp",
        securityGroupId: sg.id,
        cidrBlocks: ["0.0.0.0/0"],
    });

    return sg;

}

async function CreateElastiBeansTalk(app,role,vpc,sg,subnets,sgAlb,alb,certificateARN,account) {
    const applicationEBS = await new aws.elasticbeanstalk.Application(app.name, {
        name: app.name
    });


    let settings = pulumi.all([role.name, vpc.id,sg.id,sgAlb.id,alb.arn]).apply(([roleArn,vpcId,sgId,sgAlbId,albArn]) => { return [


        {
            namespace: "aws:elasticbeanstalk:environment",
            name: "ServiceRole",
            value: `arn:aws:iam::${account}:role/aws-service-role/elasticbeanstalk.amazonaws.com/AWSServiceRoleForElasticBeanstalk`,
        },


        //AUTOSCALE
        {
            namespace: "aws:autoscaling:asg",
            name: "MinSize",
            value: app.autoscalingMinSize,
        },
        {
            namespace: "aws:autoscaling:asg",
            name: "MaxSize",
            value:  app.autoscalingMaxSize,
        },

        {
            namespace: "aws:autoscaling:trigger",
            name: "MeasureName",
            value:  app.autoScaleConfig.measureName
        },        
        {
            namespace: "aws:autoscaling:trigger",
            name: "Statistic",
            value: app.autoScaleConfig.statistic,
        },
                
        {
            namespace: "aws:autoscaling:trigger",
            name: "Unit",
            value: app.autoScaleConfig.unit,
        },

        {
            namespace: "aws:autoscaling:trigger",
            name: "LowerThreshold",
            value: app.autoScaleConfig.lowerThreshold,
        },
        
        {
            namespace: "aws:autoscaling:trigger",
            name: "UpperThreshold",
            value: app.autoScaleConfig.upperThreshold,
        },        
        

        //INSTANCE CONFIG
        {
            namespace: "aws:ec2:instances",
            name: "InstanceTypes",
            value: app.instancesTypes.toString(),
        },
        {
            namespace: "aws:ec2:instances",
            name: "EnableSpot",
            value: app.enableSpot,
        },        
        {
            namespace: "aws:autoscaling:launchconfiguration",
            name: "IamInstanceProfile",
            value: roleArn,
        },
        {
            namespace: "aws:autoscaling:launchconfiguration",
            name: "RootVolumeType",
            value: 'gp3',
        },        
        {
            namespace: "aws:autoscaling:launchconfiguration",
            name: "RootVolumeSize",
            value: app.volumeSize,
        },



        //Network setup
        {
            namespace: "aws:ec2:vpc",
            name: "VPCId",
            value: vpcId,
        },

        {
            namespace: "aws:autoscaling:launchconfiguration",
            name: "SecurityGroups",
            value: sgId,
        },

        {
            namespace: "aws:ec2:vpc",
            name: "Subnets",
            value: subnets.ids.toString(),
        },
        

        //LOGS CONFIG
        {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs",
            name: "StreamLogs",
            value: "true"
        },     

        {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs",
            name: "RetentionInDays",
            value: app.logRetention
        },  



        {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs:health",
            name: "HealthStreamingEnabled",
            value: "true"
        },     

        {
            namespace: "aws:elasticbeanstalk:cloudwatch:logs:health",
            name: "RetentionInDays",
            value: app.logRetention
        },  

        //SHARED ALB
        {
            namespace: "aws:elasticbeanstalk:environment",
            name: "LoadBalancerIsShared",
            value: "true"
        },  

        {
            namespace: "aws:elasticbeanstalk:environment",
            name: "LoadBalancerType",
            value: "application"
        },


        

        // // //SHARED ALB CONFIG

        {
            namespace: "aws:elbv2:loadbalancer",
            name: "ManagedSecurityGroup",
            value: sgAlbId
        },

        {
            namespace: "aws:elbv2:loadbalancer",
            name: "SecurityGroups",
            value: sgAlbId
        },        


        {
            namespace: "aws:elbv2:loadbalancer",
            name: "SharedLoadBalancer",
            value: albArn
        },

        //PROCCESS CONFIG
        {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            name: "Port",
            value: app.port.toString()
        },
        {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            name: "Protocol",
            value: app.protocol
        },        
        {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            name: "MatcherHTTPCode",
            value: app.matcherHTTPCode
        },       
        {
            namespace: "aws:elasticbeanstalk:environment:process:default",
            name: "HealthCheckPath",
            value: app.healthCheckPath
        },       

        //LISTERNER RULES

        {
            namespace: "aws:elbv2:listener:default",
            name: "ListenerEnabled",
            value: 'false'
        },
        

        {
            namespace: "aws:elbv2:listener:443",
            name: "Protocol",
            value: 'HTTPS'
        },
 

        

        {
            namespace: "aws:elbv2:listener:443",
            name: "ListenerEnabled",
            value: "true"
        },

        {
            namespace: "aws:elbv2:listenerrule:httpsrule",
            name: "HostHeaders",
            value: app.hostnames.toString()
        }, 

        {
            namespace: "aws:elbv2:listenerrule:httpsrule",
            name: "PathPatterns",
            value: app.paths.toString()
        }, 

    
        {
            namespace: "aws:elbv2:listener:443",
            name: "ListenerEnabled",
            value: 'true'
        },   

        {
            namespace: "aws:elbv2:listener:443",
            name: "Rules",
            value: ['httpsrule'].toString()
        },            

        {
            namespace: "aws:elbv2:listener:443",
            name: "SSLCertificateArns",
            value: certificateARN
        },   

        //DEPLOYMENT CONFIG
        {
            namespace: "aws:elasticbeanstalk:command",
            name: "DeploymentPolicy",
            value: "RollingWithAdditionalBatch"
        },    
        {
            namespace: "aws:elasticbeanstalk:command",
            name: "BatchSizeType",
            value: "Fixed"
        },                
        {
            namespace: "aws:elasticbeanstalk:command",
            name: "BatchSize",
            value: "1"
        },         

        {
            namespace: "aws:elbv2:listenerrule:httpsrule",
            name: "Process",
            value: "default"
          },

    //healthreporting
    {
        namespace: "aws:elasticbeanstalk:healthreporting:system",
        name: "SystemType",
        value: "enhanced"
      }


    ]})

    ///settings = settings.concat(app.autoScaleConfig)

    //console.log(settings)

    const ebs = new aws.elasticbeanstalk.Environment(app.environment, {
        application: applicationEBS.name,
        tier: app.tier,
        solutionStackName: app.solutionStackName, //'64bit Windows Server Core 2016 v2.3.0 running IIS 10.0'
        settings: settings        
    });


    // return ebs;
}

async function Create(apps,configuration,subnetsPublic,subnetsPrivate,vpc,certificateARN,sgApps) {

    let alb;
    let sgAlb;
    if (apps.length > 0) {
        sgAlb = await CreateSGALB(`ebs-sg-${configuration.account}`,vpc.id);
        alb = await CreateALB(subnetsPublic,sgAlb,configuration);
    }

    
    for (const app of apps) {
        const sg =  await CreateSGEc2(app.name,vpc.id,app.vpcAccess,configuration,app.ingressRules,app.egressRules,sgAlb,app.port,app.protocol,sgApps);
        const iam =  await CreateIAMRole(app.name,app.managedPolicies,app.permissions);
        const ebs = CreateElastiBeansTalk(app,iam.instanceProfile,vpc,sg,subnetsPrivate,sgAlb,alb,certificateARN,configuration.accountNumber);
        await CreateRecordExternal(app,alb);
    }
}   


module.exports = {
    Create
}