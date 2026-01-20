const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

async function CreateCustomDomain(config) {
    const customDomain = new aws.apigatewayv2.DomainName(config.domainName, {
        domainName: config.domainName,
        domainNameConfiguration: {
            certificateArn: config.certificateArn,
            endpointType: "REGIONAL",
            securityPolicy: "TLS_1_2",
        },
    });

    console.log(`Custom Domain Name criado: ${config.domainName}`);
    return customDomain;
}

async function CreateBasePathMapping(mappingConfig, customDomain) {
    // Cria um nome único para o mapping combinando o domínio e o apiId
    const mappingName = `${mappingConfig.domainName}-${mappingConfig.restApiId}-mapping`;
    const basePathMapping = new aws.apigatewayv2.ApiMapping(mappingName, {
        apiId: mappingConfig.restApiId,
        domainName: customDomain.domainName,
        stage: mappingConfig.stage,
        ...(mappingConfig.apiMappingKey && { apiMappingKey: mappingConfig.apiMappingKey })
    });

    return basePathMapping;
}
function GetHostZone(hostname) {
    return hostname.substring(hostname.indexOf('.') + 1);
}
async function Create(inputAPIGatewayCus) {
    if (!inputAPIGatewayCus || !inputAPIGatewayCus.customDomains) {
        return [];
    }

    // Map para armazenar domínios já criados
    const domainMap = new Map();
    const customDomains = [];

    for (const domainConfig of inputAPIGatewayCus.customDomains) {
        let customDomain;

        // Verifica se o domínio já foi criado
        if (domainMap.has(domainConfig.domainName)) {
            customDomain = domainMap.get(domainConfig.domainName);
        } else {
            customDomain = await CreateCustomDomain(domainConfig);
            domainMap.set(domainConfig.domainName, customDomain);

        const zone = await aws.route53.getZone({ name: GetHostZone(domainConfig.domainName) });
        const record = await new aws.route53.Record(`ext-${domainConfig.domainName}`,{
            zoneId: zone.zoneId,
            name: domainConfig.domainName,
            type: 'A',
            aliases: [{
                name: customDomain.domainNameConfiguration.targetDomainName,
                zoneId: customDomain.domainNameConfiguration.hostedZoneId,
                evaluateTargetHealth: false,
            }],
        },{deleteBeforeReplace: true});
        }

        // Itera sobre cada mapeamento definido para o domínio
        if (Array.isArray(domainConfig.apiMappings)) {
            for (const mapping of domainConfig.apiMappings) {
                // Cria um objeto de configuração para o mapping, adicionando o domainName
                const mappingConfig = { ...mapping, domainName: domainConfig.domainName };
                await CreateBasePathMapping(mappingConfig, customDomain);
            }
        }

        customDomains.push(customDomain);
    }

    return customDomains;
}

module.exports = {
    Create,
};
