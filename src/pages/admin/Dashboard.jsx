import { useAuth } from "../../contexts/AuthContext";
import { LogOut, Fuel, Zap, Droplets } from "lucide-react";
import PriceCard from "../../components/dashboard/PriceCard";
import TankLevel from "../../components/dashboard/TankLevel";
import SalesChart from "../../components/dashboard/SalesChart";
import EmployeeTable from "../../components/dashboard/EmployeeTable";

export default function OwnerDashboard() {
    const { logout, currentUser } = useAuth();

    return (
        <div className="min-h-screen bg-dark-bg text-white p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary-orange">Owner Dashboard</h1>
                    <p className="text-gray-400 mt-1">Welcome back, {currentUser?.email}</p>
                </div>
                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-500 rounded-lg hover:bg-red-600/30 transition-colors"
                >
                    <LogOut size={18} />
                    Logout
                </button>
            </div>

            {/* Price Management Section */}
            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Fuel className="text-primary-orange" size={20} />
                    Fuel Rates
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <PriceCard
                        type="petrol"
                        label="Petrol"
                        icon={Fuel}
                        color="text-orange-500"
                    />
                    <PriceCard
                        type="diesel"
                        label="Diesel"
                        icon={Droplets}
                        color="text-blue-500"
                    />
                    <PriceCard
                        type="power"
                        label="Power"
                        icon={Zap}
                        color="text-yellow-500"
                    />
                </div>
            </section>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Tank Levels */}
                <div className="lg:col-span-1">
                    <h2 className="text-xl font-semibold mb-4">Tank Stock</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <TankLevel id="tank1" fuelType="Petrol" capacity={20000} />
                        <TankLevel id="tank2" fuelType="Diesel" capacity={20000} />
                    </div>
                </div>

                {/* Sales Chart */}
                <div className="lg:col-span-2">
                    <SalesChart />
                </div>
            </div>

            {/* Employee Oversight */}
            <section>
                <EmployeeTable />
            </section>
        </div>
    );
}
