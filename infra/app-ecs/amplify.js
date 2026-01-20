const aws = require("@pulumi/aws");
const yaml = require ("js-yaml")

async function appAmplify(app) {

    let buildSpec = {
        version: 1,
        frontend: {
            phases: {
                preBuild: {
                    commands: app.buildSpec.preBuildCmd
                },
                build: {
                    commands: app.buildSpec.buildCmd
                }
            },
            artifacts: {
                baseDirectory: app.buildSpec.baseDirectory,
                files: app.buildSpec.artifactFiles
            },
            cache: {
                paths: app.buildSpec.cachePaths
            }
        }
    };

    let buildJson = [{
            "pkg":"yarn",
            "type":"npm",
            "version":"latest"
        },
        {
            "pkg":"node",
            "type":"nvm",
            "version":"16"
        }];

    const amplifyAssumeRole = await aws.iam.getPolicyDocument({
        statements: [{
            actions: ["sts:AssumeRole"],
            effect: "Allow",
            principals: [{
                identifiers: ["amplify.amazonaws.com"],
                type: "Service",
            }],
        }],
    });

    const amplifyRole =  await new aws.iam.Role(`amplify-${app.name}`, {
        assumeRolePolicy: amplifyAssumeRole.json,
        name: `amplify-${app.name}`,
    });

    await new aws.iam.RolePolicyAttachment(`attach-role-${app.name}`, {
        policyArn: "arn:aws:iam::aws:policy/service-role/AmplifyBackendDeployFullAccess",
        role: amplifyRole.name
    }); 

    let buildSpecYAML = yaml.dump(buildSpec);

    let customRules = app.customRules.map(value => {
        return {
            source: value.source,
            status: value.status,
            target: value.target
        }
    })

    const amplifyapps = new aws.amplify.App(app.name,{
        name: app.name,
        repository: app.repository,
        buildSpec: buildSpecYAML,
        customRules: customRules,
        environmentVariables:
        {
            "_LIVE_UPDATES": JSON.stringify(buildJson),
            ...(app.appVariables)
        },

        accessToken: app.accessToken,
        enableBranchAutoBuild: app.branchAutoBuild,
        platform: app.platform,
        iamServiceRoleArn: amplifyRole.arn,
             
        
    });
        
    const amplifybranch = await new aws.amplify.Branch(app.name, {

        appId: amplifyapps.id,
        branchName: app.branchName,
        environmentVariables: app.branchVariables,
        framework: app.framework,
        stage: "PRODUCTION"

    });

    function extractDomainComponents(appDomain) {
        const regex = /^(.*?)\.(.*)$/; 
        const match = appDomain.match(regex);
        
        if (match) {
            const prefix = match[1];  
            const domainName = match[2]; 
            return { prefix, domainName };
        }
        
        throw new Error("Invalid domain format");
    };

    const dnsapp = {
        domain: app.domain,
    };

    function GetHostZone(dnsapp) {
        return dnsapp.domain.substring(dnsapp.domain.indexOf('.') + 1);
    };
    
    const { prefix, domainName } = extractDomainComponents(dnsapp.domain);
    
    const zone = await aws.route53.getZone({ name: GetHostZone(dnsapp) });

    const record = await new aws.route53.Record(app.name,{
        zoneId: zone.zoneId,
        name: app.domain,
        type: 'CNAME',
        ttl: 300,
        records: [amplifyapps.defaultDomain]
    });

    const DomainAssociation = await new aws.amplify.DomainAssociation(app.name, {
        appId: amplifyapps.id,
        domainName: domainName,
        subDomains: [{
            branchName: app.branchName,
            prefix: prefix
        }],
        certificateSettings: {
            type: app.certificateConfig.type,
            customCertificateArn: app.certificateConfig.customCertificateArn,
        },
        waitForVerification: true
    },{dependsOn: [record]});
}

async function Create(apps) {

    for (const app of apps) {
        await appAmplify(app);
    }
}

module.exports = { Create }
