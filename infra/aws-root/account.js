"use strict";
const aws = require("@pulumi/aws");
const { configuration } = require('./conf');

async function CreateAccounts(organization) {
     let accounts = [];
     for (const acc of configuration.accountsCreate) {
          const account = await new aws.organizations.Account(`${configuration.orgName}-${acc.name}`, {
               name: `${configuration.orgName}-${acc.name}`, email: acc.email,
               iamUserAccessToBilling: 'DENY',
               parentId: organization.id,
               roleName: configuration.orgRole
          });

          accounts.push({
               account: account,
               name: acc.name
          });
     }

     return accounts;
}

module.exports = { CreateAccounts }
