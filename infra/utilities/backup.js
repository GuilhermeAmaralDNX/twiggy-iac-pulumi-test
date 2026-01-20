const aws = require("@pulumi/aws");


async function CreateRole() {
    const backupRole = await new aws.iam.Role("backupRole", {
        assumeRolePolicy: `{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Action": ["sts:AssumeRole"],
          "Effect": "allow",
          "Principal": {
            "Service": ["backup.amazonaws.com"]
          }
        }
      ]
    }
    
    `,
        namePrefix: "aws-backup-",
    });


    const backupPolicyAttach = await new aws.iam.RolePolicyAttachment("backupPolicyAttach", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup",
        role: backupRole.name,
    });

    return backupRole;

}



async function CreateVault(configuration) {
    const backupVault = await new aws.backup.Vault(`vault-${configuration.account}-backup`, {
        name: `vault-${configuration.account}-backup`,
        // kmsKeyArn: configuration.vault_kms_key_arn,
        tags: {
            Job: `${configuration.account}-backup`,
        },
    });

    return backupVault;
}

async function CreateBackupPlan(backupVault,configuration) {
    const backupPlan = await new aws.backup.Plan("backupPlan", {
        tags: {
            Job: `${configuration.account}-backup`,
        },
        rules: [{
            ruleName: `rule-${configuration.account}-backup`,
            targetVaultName: backupVault.name,
            schedule: configuration.backupSchedule,
            startWindow: configuration.backupStartWindow,
            completionWindow: configuration.backupCompletionWindow,
            lifecycle: {
                coldStorageAfter: configuration.backupColdStorageAfter,
                deleteAfter: configuration.backupDeleteAfter,
            },
            recoveryPointTags: {
                Job: `${configuration.account}-backup`,
            },
        }],
    });

    return backupPlan;
}


async function BackupTagSelection(backupPlan,backupRole,configuration) {
    const backupSelection = await new aws.backup.Selection(`selection-${configuration.account}-backup`, {
        name: `selection-${configuration.account}-backup`,
        iamRoleArn: backupRole.arn,
        planId: backupPlan.id,
        selectionTags: [{
            type: configuration.selectionTagType,
            key: configuration.selectionTagKey,
            value: configuration.selectionTagValue,
        }],
    });
}


module.exports = {
    CreateRole, CreateVault, CreateBackupPlan, BackupTagSelection
}