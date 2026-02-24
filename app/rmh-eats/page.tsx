import type { Metadata } from 'next';
import RMHEatsApp from '@/components/rmh-eats/RMHEatsApp';

export const metadata: Metadata = {
    title: 'RMH Eats — Food Delivery',
    description: 'Order food from mock restaurants, customize your meals, track deliveries, and leave reviews.',
};

export default function RMHEatsPage() {
    return <RMHEatsApp />;
}
