const aws = require("@pulumi/aws");

async function CreateSG(name, vpcId, ingressRules, egressRules) {
    // Garante que ingressRules e egressRules sejam arrays (evita "not iterable")
    ingressRules = Array.isArray(ingressRules) ? ingressRules : [];
    egressRules = Array.isArray(egressRules) ? egressRules : [];

    // Cria o security group
    const sg = new aws.ec2.SecurityGroup(`${name}`, {
        vpcId: vpcId,
        name: `${name}`,
    });

    // Cria as regras de entrada (ingress)
    let sgIngressIndex = 0;
    for (const ingress of ingressRules) {
        await new aws.ec2.SecurityGroupRule(`${name}-ingress-${sgIngressIndex}`, {
            securityGroupId: sg.id,
            fromPort: ingress.fromPort,
            toPort: ingress.toPort,
            protocol: ingress.protocol,
            type: 'ingress',
            ...(ingress.sourceSecurityGroupId && { sourceSecurityGroupId: ingress.sourceSecurityGroupId }),
            ...(ingress.cidrBlocks && { cidrBlocks: ingress.cidrBlocks })
        });
        sgIngressIndex++;
    }

    // Cria as regras de saída (egress)
    let sgEgressIndex = 0;
    for (const egress of egressRules) {
        await new aws.ec2.SecurityGroupRule(`${name}-egress-${sgEgressIndex}`, {
            securityGroupId: sg.id,
            fromPort: egress.fromPort,
            toPort: egress.toPort,
            protocol: egress.protocol,
            type: 'egress',
            ...(egress.sourceSecurityGroupId && { sourceSecurityGroupId: egress.sourceSecurityGroupId }),
            ...(egress.cidrBlocks && { cidrBlocks: egress.cidrBlocks })
        });
        sgEgressIndex++;
    }

    return sg;
}

async function CreateMultipleSGs(sgConfigs, vpc) {
    const securityGroups = [];
    
    // Se não há configurações ou se sgConfigs não tem a propriedade securityGroups, retorna array vazio
    if (!sgConfigs || !sgConfigs.securityGroups) {
        return securityGroups;
    }

    // Itera sobre as configurações e cria os security groups
    for (const config of sgConfigs.securityGroups) {
        const sg = await CreateSG(config.name, vpc.id, config.ingressRules, config.egressRules);
        securityGroups.push(sg);
    }

    return securityGroups;
}

module.exports = {
    CreateSG,
    CreateMultipleSGs
};
