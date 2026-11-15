import { expect, it } from 'vitest';
import { isPrivateIp } from '../private-ip';

const PRIVATE = [
  '127.0.0.1',
  '10.0.0.5',
  '172.16.0.1',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '0.0.0.0',
  '192.0.0.1',
  '198.18.0.1',
  '224.0.0.1',
  '240.0.0.1',
  '255.255.255.255',
  '::',
  '::1',
  'fc00::1',
  'fd12::1',
  'fe80::1',
  'fec0::1',
  'ff02::1',
  '::ffff:10.0.0.5',
  '::ffff:7f00:1',
  '::1%lo',
  'fe80::1%eth0',
  '0:0:0:0:0:ffff:7f00:1',
  '0:0:0:0:0:ffff:127.0.0.1',
  '0000:0000:0000:0000:0000:ffff:7f00:0001',
  '::0:ffff:7f00:1',
  '::7f00:1',
  '::127.0.0.1',
  '::5db8:d822',
  '64:ff9b::7f00:1',
  '64:ff9b::10.0.0.5',
  '2002:7f00:1::',
  '2002:0a00:0001::',
];
const PUBLIC = [
  '93.184.216.34',
  '8.8.8.8',
  '2606:4700::1111',
  '2001:4860:4860::8888',
  '::ffff:5db8:d822',
  '::ffff:93.184.216.34',
  '64:ff9b::5db8:d822',
  '2002:5db8:d822::',
];

it('flags private, loopback, link-local, multicast, mapped, compatible, NAT64 and 6to4 addresses', () => {
  for (const ip of PRIVATE) expect(isPrivateIp(ip), ip).toBe(true);
});
it('passes public addresses, including public embedded IPv4', () => {
  for (const ip of PUBLIC) expect(isPrivateIp(ip), ip).toBe(false);
});
it('fails closed on anything unparseable', () => {
  for (const s of ['example.com', '', '1.2.3', '1.2.3.4.5', ':::', '1::2::3', 'g::1'])
    expect(isPrivateIp(s), s).toBe(true);
});
