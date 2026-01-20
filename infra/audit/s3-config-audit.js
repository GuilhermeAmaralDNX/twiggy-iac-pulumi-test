const aws = require('@pulumi/aws');

async function CreateS3Audit(configuration, bucketLogging) {
  const accountAllow = [];

  for (const account of configuration.accounts) {
    accountAllow.push(`arn:aws:iam::${account.id}:root`);
  }



  const policyDoc = aws.iam.getPolicyDocument({
    statements: [{
      sid: 'CWLogs',
      effect: 'Allow',
      principals: [{
        type: 'Service',
        identifiers: ['logs.amazonaws.com']
      }],
      actions: [
        's3:PutObject'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-logs-${configuration.region}/*`
      ]
    },
    {
      sid: 'OrgAccounts',
      effect: 'Allow',
      principals: [{
        type: 'AWS',
        identifiers: accountAllow
      }],
      actions: [
        's3:PutObject'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-logs-${configuration.region}/*`
      ]
    },
    {
      sid: 'OrgAccountsAcl',
      effect: 'Allow',
      principals: [{
        type: 'AWS',
        identifiers: accountAllow,
      }],
      actions: [
        's3:GetBucketAcl',
        's3:PutBucketAcl'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-logs-${configuration.region}`
      ]

    },

    {
      sid: 'CWLogsAcl',
      effect: 'Allow',
      principals: [{
        type: 'Service',
        identifiers: ['logs.amazonaws.com']
      }],
      actions: [
        's3:GetBucketAcl'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-logs-${configuration.region}`
      ]

    }]
  });

  const s3 = await new aws.s3.Bucket('AuditLogs', {
    bucket: `${configuration.orgName}-audit-logs-${configuration.region}`,
    acl: 'private',
    policy: policyDoc.then(policyDoc => policyDoc.json),
    ...(configuration.enableBucketLogging && {
      loggings: [{
        targetBucket: bucketLogging.bucket,
        targetPrefix: 'audit-logs-access'
      }]
    }),
    serverSideEncryptionConfiguration: {
      rule: {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: 'AES256'
        }
      }
    },
    lifecycleRules: [{
      id: 'ARCHIVING',
      enabled: true,
      transitions: [{
        days: 30,
        storageClass: 'STANDARD_IA'
      },
      {
        days: configuration.transitionGlacierDays,
        storage_class: 'GLACIER'
      }]
    }]
  });
  return s3;

}

async function CreateS3Config(configuration, bucketLogging) {

  const accountAllow = [];

  for (const account of configuration.accounts.filter((a) => { if (a.env != 'audit') return a })) {
    accountAllow.push(`arn:aws:iam::${account.id}:root`);
  }

  const policyDoc = aws.iam.getPolicyDocument({
    statements: [{
      sid: 'ConfigLogs',
      effect: 'Allow',
      principals: [{
        type: 'Service',
        identifiers: ['config.amazonaws.com']
      }],
      actions: [
        's3:PutObject'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-config-${configuration.region}/*`
      ]
    },
    {
      sid: 'OrgAccounts',
      effect: 'Allow',
      principals: [{
        type: 'AWS',
        identifiers: accountAllow
      }],
      actions: [
        's3:PutObject'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-config-${configuration.region}/*`
      ]
    },
    {
      sid: 'OrgAccountsAcl',
      effect: 'Allow',
      principals: [{
        type: 'AWS',
        identifiers: accountAllow,
      }],
      actions: [
        's3:GetBucketAcl',
        's3:PutBucketAcl'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-config-${configuration.region}`
      ]

    },

    {
      sid: 'ConfigLogsAcl',
      effect: 'Allow',
      principals: [{
        type: 'Service',
        identifiers: ['config.amazonaws.com']
      }],
      actions: [
        's3:GetBucketAcl'
      ],
      resources: [
        `arn:aws:s3:::${configuration.orgName}-audit-config-${configuration.region}`
      ]

    }]
  });

  const s3 = await new aws.s3.Bucket('AuditConfig', {
    bucket: `${configuration.orgName}-audit-config-${configuration.region}`,
    acl: 'private',
    policy: policyDoc.then(policyDoc => policyDoc.json),
    // ...(configuration.enableBucketLogging && {
    //   loggings: [{
    //     targetBucket: bucketLogging.bucket,
    //     targetPrefix: 'audit-config-access'
    //   }]
    // }),
    serverSideEncryptionConfiguration: {
      rule: {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: 'AES256'
        }
      }
    },
    lifecycleRules: [{
      id: 'ARCHIVING',
      enabled: true,
      transitions: [{
        days: 30,
        storageClass: 'STANDARD_IA'
      },
      {
        days: configuration.transitionGlacierDays,
        storage_class: 'GLACIER'
      }]
    }]
  },{ignoreChanges: ['lifecycleRules','loggings']});


  if(configuration.enableBucketLogging)
    await new aws.s3.BucketLoggingV2(`logging-audit-config`,{
      bucket: s3.bucket,
      targetBucket: bucketLogging.bucket,
      targetPrefix: 'audit-config-access'
  });

  return s3;
}


module.exports = {
  CreateS3Audit, CreateS3Config
}
