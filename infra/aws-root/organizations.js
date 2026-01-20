"use strict";
const aws = require("@pulumi/aws");
const {configuration} = require('./conf');

async function CreateOrganizations() {
    let organizationRoot;

    if (configuration.organizationRootExists) {
        let organizations = await aws.organizations.getOrganization({});
        organizationRoot = organizations.roots.filter((a) => { return a.name === configuration.organizationRootName })[0];
    } else {
        organizationRoot = await new aws.organizations.Organization('Root',
            {
                featureSet: 'ALL',
                awsServiceAccessPrincipals: ["cloudtrail.amazonaws.com", "config.amazonaws.com",], enabledPolicyTypes: ['SERVICE_CONTROL_POLICY']
            });
    }

    const organization = await new aws.organizations.OrganizationalUnit(configuration.orgName, { name: configuration.orgName, parentId: organizationRoot.id });

    return organization;
}

module.exports = { CreateOrganizations }
