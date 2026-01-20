const aws = require("@pulumi/aws");
const config = require('./conf');

function GetHostZone(hostname) {
    return hostname.substring(hostname.indexOf('.') + 1);
}

async function CreateRecordExternal(app,loadBalance) {
		let index =0;
        for (const hostname of app.hostnames) {
            const zone = await aws.route53.getZone({ name: GetHostZone(hostname) });

            const record = await new aws.route53.Record(`ext-${app.name}-${index}`,{
                zoneId: zone.zoneId,
                name: hostname,
                type: 'CNAME',
                ttl: 300,
                records: [loadBalance.dnsName]
            },{deleteBeforeReplace: true});
			index++;
        }
}

async function CreateRecordInternal(app,loadBalance) {
		let index =0;
        for (const hostname of app.hostnames) {
            const zone = await aws.route53.getZone({ name: GetHostZone(hostname) });

            const record = await new aws.route53.Record(`int-${app.name}-${index}`,{
                zoneId: zone.zoneId,
                name: hostname,
                type: 'CNAME',
                ttl: 300,
                records: [loadBalance.dnsName]
            },{deleteBeforeReplace: true});
			index++;
        }

}

module.exports = {
    CreateRecordExternal,
    CreateRecordInternal
}