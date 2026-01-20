const aws = require("@pulumi/aws");

async function CreateACM(configuration) {

    //const domain = await aws.route53.getZone({ name: configuration.domainName });

    let certs = [];
    for (const cert of configuration.certificates) {
        const acm = await new aws.acm.Certificate(cert.domains[0], {
            domainName: cert.domains[0],
            subjectAlternativeNames: cert.domains.filter(item => item !== cert.domains[0]),
            validationMethod: 'DNS'

        });


        if (cert.validate === "true") {
            let index = 0;


            for (const d of cert.domains) {
                acm.domainName
                const domain = await aws.route53.getZone({ name: cert.domains[0] });

                const dnsRecord = await new aws.route53.Record(`${cert.name}-${index}`, {
                    name: acm.domainValidationOptions[index].resourceRecordName,
                    type: acm.domainValidationOptions[index].resourceRecordType,
                    zoneId: domain.zoneId,
                    allowOverwrite: true,
                    records: [acm.domainValidationOptions[index].resourceRecordValue],
                    ttl: 60
                });

                await new aws.acm.CertificateValidation(`${cert.name}-${index}`, {
                    certificateArn: acm.arn,
                    validationRecordFqdns: [dnsRecord.fqdn]
                }, { dependsOn: [dnsRecord] })
                index++;
            }


        }



        certs.push({
            certificate: acm.domainName,
            arn: acm.arn
        })
    }

    return certs;


}

module.exports = {
    CreateACM
}