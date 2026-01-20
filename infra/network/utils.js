var ipaddress = require('ip-address');
var BigInteger = require('jsbn').BigInteger;

// Takes an IP address range in CIDR notation (like 10.0.0.0/8) and extends its prefix to include an additional subnet number.
// For example: 
// * cidrsubnet("10.0.0.0/8", 8, 2) returns 10.2.0.0/16
// * cidrsubnet("2607:f298:6051:516c::/64", 8, 2) returns 2607:f298:6051:516c:200::/72
exports.cidrSubnet = function(iprange, newbits, netnum) {
    var ipv4 = new ipaddress.Address4(iprange);
    var ipv6 = false;//new ipaddress.Address6(iprange);
    if (ipv4.isCorrect()) {
        // Get the subnet mask from the CIDR notation
        var parts = iprange.split('/');
        var currentMask = parseInt(parts[1]);
        var newsubnetMask = currentMask + newbits;
        if (newsubnetMask > 32) {
            throw new Error("Requested " + newbits + " new bits, but only " + (32 - currentMask) + " are available.");
        }
        
        // Convert IP to numeric value
        var octets = ipv4.addressMinusSuffix.split('.');
        var addressBI = new BigInteger('0');
        for (var i = 0; i < 4; i++) {
            addressBI = addressBI.shiftLeft(8).add(new BigInteger(octets[i]));
        }
        
        var twoBI = new BigInteger('2');
        var netnumBI = new BigInteger(netnum.toString())
        
        var newAddressBI = addressBI.add(twoBI.pow(32 - newsubnetMask).multiply(netnumBI));
        
        // Convert numeric value back to IP
        var octets = [];
        var tempBI = newAddressBI;
        for (var i = 0; i < 4; i++) {
            octets.unshift(tempBI.and(new BigInteger('255')).toString());
            tempBI = tempBI.shiftRight(8);
        }
        
        return octets.join('.') + "/" + newsubnetMask;
    } else if (ipv6 && ipv6.isValid()) {
        var parts = iprange.split('/');
        var currentMask = parseInt(parts[1]);
        var newsubnetMask = currentMask + newbits;
        if (newsubnetMask > 128) {
            throw new Error("Requested " + newbits + " new bits, but only " + (128 - currentMask) + " are available.");
        }
        // IPv6 handling would go here
        throw new Error("IPv6 not implemented yet");
    } else {
        throw new Error("Invalid IP address range: " + iprange);
    }
};

// Takes an IP address range in CIDR notation and creates an IP address with the given host number.
// If given host number is negative, the count starts from the end of the range.
// For example:
// * cidrhost("10.0.0.0/8", 2) returns 10.0.0.2
// * cidrhost("10.0.0.0/8", -2) returns 10.255.255.254
exports.cidrHost = function(iprange, hostnum) {
    var ipv4 = new ipaddress.Address4(iprange);
    if (ipv4.isCorrect()) {
        // Parse CIDR notation
        var parts = iprange.split('/');
        var baseIp = parts[0];
        var mask = parseInt(parts[1]);
        
        // Convert base IP to numeric
        var octets = baseIp.split('.');
        var baseBI = new BigInteger('0');
        for (var i = 0; i < 4; i++) {
            baseBI = baseBI.shiftLeft(8).add(new BigInteger(octets[i]));
        }
        
        // Calculate network and host portions
        var networkMask = new BigInteger('1').shiftLeft(32 - mask).subtract(new BigInteger('1'));
        var hostBI = new BigInteger(hostnum.toString());
        
        // Calculate final address
        var addressBI;
        if (hostnum >= 0) {
            addressBI = baseBI.and(networkMask.not()).add(hostBI);
        } else {
            var maxHost = new BigInteger('1').shiftLeft(32 - mask).subtract(new BigInteger('1'));
            addressBI = baseBI.and(networkMask.not()).add(maxHost.add(hostBI).add(new BigInteger('1')));
        }
        
        // Convert back to IP address
        var resultOctets = [];
        var tempBI = addressBI;
        for (var i = 0; i < 4; i++) {
            resultOctets.unshift(tempBI.and(new BigInteger('255')).toString());
            tempBI = tempBI.shiftRight(8);
        }
        
        return resultOctets.join('.');
    } else {
        throw new Error("Invalid IP address range: " + iprange);
    }
}