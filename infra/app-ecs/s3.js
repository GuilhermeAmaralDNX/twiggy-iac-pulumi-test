const aws = require("@pulumi/aws");


async function CreateCloudFront(cfList, bucket, tags) {


    const current = await aws.getCallerIdentity();

    let providerIndex = 1;
    // adicionar uma condição e parametrização posteriormente
    const providerAWS = new aws.Provider(`provider-acm-${providerIndex}`,{
        region: 'us-east-1',
    });

    const acm = await new aws.acm.Certificate(cfList.cloudFront.acmCertificateDomain, {
        domainName: cfList.cloudFront.acmCertificateDomain,
        subjectAlternativeNames: [`*.${cfList.cloudFront.acmCertificateDomain}`],
        validationMethod: 'DNS',
        tags: {...{goal: "general"},...generalTags},
    },{
        provider:  providerAWS
    });

    const originacl = new aws.cloudfront.OriginAccessControl(`oacl-${cfList.name}`, {
        originAccessControlOriginType: "s3",
        signingBehavior: "always", // never, always, or when-required
        signingProtocol: "sigv4",
        name: `oacl-${cfList.name}`
    },{
        provider:  providerAWS
    });

    const oai = await new aws.cloudfront.OriginAccessIdentity("oai", {
        comment: "OAI for App bucket and cloudfront distribution",
    },{
        provider:  providerAWS
    }); 

    const cf = await new aws.cloudfront.Distribution(`cf-${cfList.name}`, {
        viewerCertificate: {
            acmCertificateArn: acm.arn,
            minimumProtocolVersion: 'TLSv1.2_2021',
            sslSupportMethod: 'sni-only',
            cloudfrontDefaultCertificate: false
        },
        origins: [{
            domainName: bucket.bucketRegionalDomainName,
            originAccessControlId: originacl.id,
            originId: cfList.cloudFront.originId,
        }],
        enabled: true,
        isIpv6Enabled: true,
        defaultRootObject: cfList.cloudFront.defaultRootObject,
        aliases: cfList.cloudFront.aliases,
        defaultCacheBehavior: {
            allowedMethods: [
                "DELETE",
                "GET",
                "HEAD",
                "OPTIONS",
                "PATCH",
                "POST",
                "PUT",
            ],
            cachedMethods: [
                "GET",
                "HEAD",
            ],
            targetOriginId: cfList.cloudFront.originId,
            forwardedValues: {
                queryString: false,
                cookies: {
                    forward: "none",
                },
            },
            viewerProtocolPolicy: "redirect-to-https",
            minTtl: 0,
            defaultTtl: 3600,
            maxTtl: 86400,
        },
        customErrorResponses: [
            {
                errorCode: 404,
                errorCachingMinTtl: 10,
                responseCode: 200,
                responsePagePath: "/index.html",
            },
        ],
        priceClass: "PriceClass_200",
        restrictions: {
            geoRestriction: {
                restrictionType: "whitelist",
                locations: [
                    "BR",
                    "US"
                ],
            },
        },
        tags: {...tags,...generalTags},
    },{
        provider:  providerAWS
    });

    const selected = aws.route53.getZone({  
        name: cfList.cloudFront.acmCertificateDomain,
        privateZone: false,
    });

    new aws.route53.Record(`www-${cfList.name}`, {
        zoneId: selected.then(selected => selected.zoneId),
        name: cfList.cloudFront.aliases[0],
        type: "CNAME",
        ttl: 300,
        records: [cf.domainName],
    });
    
    let url = cf.id.apply(id => `arn:aws:cloudfront::${current.accountId}:distribution/${id}`)

    const s3PolicyDoc = await aws.iam.getPolicyDocumentOutput ({
        policyId: "PolicyForCloudFrontPrivateContent",
        statements: [{
            sid: "AllowCloudFrontServicePrincipal",
            principals: [
            {
                type: "Service",
                identifiers: ["cloudfront.amazonaws.com"],

            }],
            actions: ["s3:GetObject"],
            resources: [bucket.arn, pulumi.all([bucket.arn]).apply(([bucketArn]) => `${bucketArn}/*`),],
            conditions: [{
                test: "StringEquals",
                variable: "AWS:SourceArn",
                values: [
                    url
                ],
            }],
        }],
    });


    
    const s3Policy = await new aws.s3.BucketPolicy(`s3-${cfList.name}-policy`, {
        bucket: bucket.id,
        policy: s3PolicyDoc.apply(s3PolicyDoc => s3PolicyDoc.json),
    });
}



async function CreatePolicyKMS(customPermission) {

    const currentId = await aws.getCallerIdentity();

    let statements = [{
        effect: "Allow",
        principals: [{
            identifiers: [`arn:aws:iam::${currentId.accountId}:root`],
            type: "AWS"
        }],
        actions: ["kms:*"],
        resources: ["*"],
        sid: "default",
    }
    ];

    statements = statements.concat(customPermission);

    const policy = await aws.iam.getPolicyDocument({
        statements: statements
    });

    return policy;
}

async function CreateKMS(customKMSPermission) {
    const localTags = {
        goal: "general"
    };

    const kms = await new aws.kms.Key(`s3-default`,{
        enableKeyRotation: true,
        description: 'S3 default kms',
        policy: (await CreatePolicyKMS(customKMSPermission)).json,
        tags: localTags,
    });

    return kms;
}

async function CreateS3(s3Config) {
    // Handle case where s3Config or listS3 is undefined
    if (!s3Config || !s3Config.listS3) {
        return [];  // Return empty array if no S3 configuration is provided
    }

    let kms;
    let s3Outputs = [];

    let createKMS = s3Config.listS3.length > 0 && s3Config.listS3.filter(tmp => tmp.sseAlgorithm === 'aws:kms').length > 0;

    if (createKMS)
        kms = await CreateKMS(s3Config.customKMSPermission);

    let index = 0;
    for (const s3 of s3Config.listS3) {
        
        const bucket = await new aws.s3.Bucket(`s3-${s3.name.substring(1-29)}`,{
            acl: s3.acl,
            ...(s3.name && {bucket: s3.name} ),
            ...(s3.bucketPrefix && {bucketPrefix: s3.bucketPrefix} ),
            serverSideEncryptionConfiguration: {
                rule: {
                    bucketKeyEnabled: true,
                    applyServerSideEncryptionByDefault: {
                        sseAlgorithm: s3.sseAlgorithm,
                        ...(s3.sseAlgorithm === 'aws:kms' && {kmsMasterKeyId: kms.arn} ),                        
                    }
                }
            },
            ...(s3.tags && {tags: s3.tags})            
        }, {
            ...(s3.import && {import: s3.import} ),
        });

        if (s3.policy && s3.policy.length > 0) {
            const policy = await aws.iam.getPolicyDocument({
                statements: s3.policy
            });

            await new aws.s3.BucketPolicy(`s3-${s3.name}-policy`, {
                bucket: bucket.id,
                policy: policy.json
            });            
        }        

        if (s3.cloudFront && s3.cloudFront.enable){
            CreateCloudFront(s3, bucket, s3.tags)
        }

        index++;        

        s3Outputs.push({
            s3: bucket.bucketPrefix,
            s3ARN: bucket.arn
        });

    }

    return {
        kms: createKMS ? kms.arn : null,
        s3: s3Outputs
    };

}

module.exports = {
    CreateS3
}