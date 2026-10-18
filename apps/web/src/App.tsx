import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { CatalogPage } from './pages/Catalog';
import { ProductDetailPage } from './pages/ProductDetail';
import { CartPage } from './pages/Cart';
import { CheckoutPage } from './pages/Checkout';
import { LoginPage, RegisterPage } from './pages/Auth';
import { HowToBuyPage } from './pages/HowToBuy';
import { PoliciesPage } from './pages/Policies';
import { NotFoundPage } from './pages/NotFound';
import { AccountChat, AccountHome, AccountLayout, AccountOrderDetail, AccountOrders, AccountProfile } from './pages/account/Account';
import { StaffLayout } from './pages/staff/StaffLayout';
import { StaffChat, StaffOrderDetail, StaffOrders, StaffPayments, StaffPickups } from './pages/staff/StaffPages';
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminProductEdit, AdminProducts } from './pages/admin/Products';
import { AdminAudit, AdminPaymentMethods, AdminRates, AdminSellers, AdminUsers } from './pages/admin/AdminMisc';
import { AdminSettings } from './pages/admin/Settings';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="catalogo" element={<CatalogPage />} />
        <Route path="producto/:sku" element={<ProductDetailPage />} />
        <Route path="carrito" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="ingresar" element={<LoginPage />} />
        <Route path="registro" element={<RegisterPage />} />
        <Route path="como-comprar" element={<HowToBuyPage />} />
        <Route path="politicas" element={<PoliciesPage />} />
        <Route path="cuenta" element={<AccountLayout />}>
          <Route index element={<AccountHome />} />
          <Route path="operaciones" element={<AccountOrders />} />
          <Route path="operaciones/:code" element={<AccountOrderDetail />} />
          <Route path="chat" element={<AccountChat />} />
          <Route path="chat/:id" element={<AccountChat />} />
          <Route path="perfil" element={<AccountProfile />} />
        </Route>
        <Route path="vendedor" element={<StaffLayout area="seller" />}>
          <Route index element={<StaffOrders />} />
          <Route path="operaciones/:id" element={<StaffOrderDetail />} />
          <Route path="pagos" element={<StaffPayments />} />
          <Route path="retiros" element={<StaffPickups />} />
          <Route path="chat" element={<StaffChat />} />
          <Route path="chat/:id" element={<StaffChat />} />
        </Route>
        <Route path="admin" element={<StaffLayout area="admin" />}>
          <Route index element={<AdminDashboard />} />
          <Route path="operaciones" element={<StaffOrders />} />
          <Route path="operaciones/:id" element={<StaffOrderDetail />} />
          <Route path="pagos" element={<StaffPayments />} />
          <Route path="retiros" element={<StaffPickups />} />
          <Route path="productos" element={<AdminProducts />} />
          <Route path="productos/:id" element={<AdminProductEdit />} />
          <Route path="vendedores" element={<AdminSellers />} />
          <Route path="usuarios" element={<AdminUsers />} />
          <Route path="tasa" element={<AdminRates />} />
          <Route path="metodos-pago" element={<AdminPaymentMethods />} />
          <Route path="configuracion" element={<AdminSettings />} />
          <Route path="chat" element={<StaffChat />} />
          <Route path="chat/:id" element={<StaffChat />} />
          <Route path="auditoria" element={<AdminAudit />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
