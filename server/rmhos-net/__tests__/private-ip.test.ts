import {
  expect,
  it,
} from 'vitest';
import { isPrivateIp } from '../private-ip';

it('flags private, loopback, link-local, CGNAT and mapped addresses', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:10.0.0.5',
    '::ffff:7f00:1',
  ])
    expect(
      isPrivateIp(
        ip,
      ),
      ip,
    ).toBe(
      true,
    );
});
it('passes public addresses', () => {
  for (const ip of [
    '93.184.216.34',
    '2606:4700::1111',
    '::ffff:5db8:d822',
  ])
    expect(
      isPrivateIp(
        ip,
      ),
      ip,
    ).toBe(
      false,
    );
});
it('fails closed on a non-IP string', () => {
  expect(
    isPrivateIp(
      'example.com',
    ),
  ).toBe(
    true,
  );
  expect(
    isPrivateIp(
      '',
    ),
  ).toBe(
    true,
  );
});
