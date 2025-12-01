import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const data = [
    { name: 'Mon', Petrol: 4000, Diesel: 2400 },
    { name: 'Tue', Petrol: 3000, Diesel: 1398 },
    { name: 'Wed', Petrol: 2000, Diesel: 9800 },
    { name: 'Thu', Petrol: 2780, Diesel: 3908 },
    { name: 'Fri', Petrol: 1890, Diesel: 4800 },
    { name: 'Sat', Petrol: 2390, Diesel: 3800 },
    { name: 'Sun', Petrol: 3490, Diesel: 4300 },
];

export default function SalesChart() {
    return (
        <div className="bg-card-bg p-6 rounded-xl border border-gray-800 h-[400px]">
            <h3 className="text-xl font-semibold text-white mb-6">Weekly Sales Overview</h3>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="name" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    <Bar dataKey="Petrol" fill="#FF5722" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Diesel" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
