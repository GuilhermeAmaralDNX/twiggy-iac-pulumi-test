const aws = require('@pulumi/aws');
const pulumi = require('@pulumi/pulumi');

async function CreateVPCLink(name, subnets, vpcId) {
    const sg = await new aws.ec2.SecurityGroup(name, {
        name: name,
        vpcId: vpcId,
        ingress: [{
            fromPort: 0,
            toPort: 0,
            protocol: `-1`,
            cidrBlocks: [`0.0.0.0/0`]
        }],
        egress: [{
            fromPort: 0,
            toPort: 0,
            protocol: `-1`,
            cidrBlocks: [`0.0.0.0/0`]
        }]
    });

    const vpcLink = await new aws.apigatewayv2.VpcLink(name, {
        name: name,
        subnetIds: subnets,
        securityGroupIds: [sg.id]
    });

    return vpcLink;
}

async function CreateHTTPApi(apiConfig, vpcLink) {
    if (!apiConfig) {
        return null;
    }

    const apiParams = {
        name: apiConfig.name,
        protocolType: apiConfig.protocolType,
        description: apiConfig.description,
        ...(apiConfig.cors && {
            corsConfiguration: {
                allowOrigins: apiConfig.cors.allowOrigins || ["*"],
                allowMethods: apiConfig.cors.allowMethods || ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allowHeaders: apiConfig.cors.allowHeaders || ["Content-Type", "Authorization"]
            }
        })
    };

    const api = await new aws.apigatewayv2.Api(apiConfig.name, apiParams);

    // Verifica se stages existe
    if (apiConfig.stages) {
        for (const stage of apiConfig.stages) {
            new aws.apigatewayv2.Stage(`stage.name-${apiConfig.name}`, {
                apiId: api.id,
                name: stage.name,
                autoDeploy: true
            });
        }
    }

    let authorizes_map = {}

    if (apiConfig.authorizer)
        for (const authz of apiConfig.authorizer)
        authorizes_map[authz.name] = new aws.apigatewayv2.Authorizer(authz.name,{
                apiId: api.id,
                authorizerType: authz.authorizerType,                
                identitySources: authz.identitySources,     
                ...(authz.authorizerType === 'JWT' && {jwtConfiguration: {
                    audiences: authz.audiences,
                    issuer: authz.issuer
                }}),
                ...(authz.authorizerType === 'REQUEST' && {
                    authorizerUri: authz.authorizerUri
                }),
                ...(authz.authorizerPayloadFormatVersion && {authorizerPayloadFormatVersion: authz.authorizerPayloadFormatVersion})                
            })

    for (const integration of apiConfig.integrations) {
        const integrationV2 = await new aws.apigatewayv2.Integration(integration.name, {
            apiId: api.id,
            integrationType: integration.integrationType,
            integrationUri: integration.integrationUri,
            ...((integration.integrationType === 'HTTP_PROXY') && { connectionId: vpcLink.id }),
            ...(integration.connectionType && { connectionType: integration.connectionType }),
            integrationMethod: integration.integrationMethod,
            tlsConfig: {
                serverNameToVerify: integration.serverNameToVerify
            },
            ...(integration.requestParameters && { requestParameters: integration.requestParameters }),
        },{
            // ignoreChanges: ["requestParameters.remove"]
        }        
    );
        
        await new aws.apigatewayv2.Route(integration.name, {
            apiId: api.id,
            routeKey: integration.routeKey,
            target: pulumi.interpolate`integrations/${integrationV2.id}`,
            ...(integration.authorizer && {authorizerId: authorizes_map[integration.authorizer].id}),
            ...(integration.authorizer && {authorizationType: integration.authorizationTypeRoute } )
        });

    }
}


async function CreateRestApi(apiConfig) {
    const restApi = await new aws.apigateway.RestApi(apiConfig.name, {
        name: apiConfig.name,
    })

    // const dpl = await new aws.apigateway.Deployment(apiConfig.name, {
    //     restApi: restApi.id,
    // })

    // for (const stage of apiConfig.stages) {
    //     new aws.apigateway.Stage(stage.name, {
    //         restApi: restApi.id,
    //         stageName: stage.name,
    //         deployment: dpl.id
    //     });
    // }

    let resource_map = {}
    for (const resource of apiConfig.resources) {

        const rsr = new aws.apigateway.Resource(`${resource.name}`, {
            restApi: restApi.id,
            parentId: resource.parent ? resource_map[resource.parent].id  : restApi.rootResourceId,
            name: resource.name,
            pathPart: resource.path
        });

        resource_map[resource.name] = rsr

        for (const method of resource.methods) {
            const meth = await new aws.apigateway.Method(`${method.httpMethod}-${resource.name}`, {
                restApi: restApi.id,
                resourceId: rsr.id,
                httpMethod: method.httpMethod,
                authorization: method.authorization
            });

            await new aws.apigateway.Integration(method.integrationName, {
                restApi: restApi.id,
                httpMethod: meth.httpMethod,
                resourceId: rsr.id,
                type: method.integrationType,
                integrationHttpMethod: method.httpMethod,
                uri: method.uri
            })

            if (method.integrationType === 'AWS_PROXY')
                new aws.lambda.Permission(`${method.httpMethod}-${resource.name}`, {
                    action: "lambda:InvokeFunction",
                    function: method.lambdaName,
                    principal: "apigateway.amazonaws.com",
                    sourceArn: pulumi.interpolate`${restApi.executionArn}/*/*`,
                });

        }


    }



}


async function Create(inputAPIGateway, subnets, vpcId) {
    let vpcLink;
    if (inputAPIGateway.length > 0)
        vpcLink = await CreateVPCLink('private', subnets, vpcId);
    for (const input of inputAPIGateway) {
        await CreateHTTPApi(input, vpcLink);
    }
}


async function CreateRest(inputAPIGateway) {
    for (const input of inputAPIGateway) {
        await CreateRestApi(input)
    }
}

module.exports = {
    Create, CreateRest
};
