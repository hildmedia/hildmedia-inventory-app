import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import {
  categories,
  EquipmentFormData,
  EquipmentItem,
  EquipmentStatus,
  statuses,
} from './types';
import { DEFAULT_WORKSPACE_ID } from './workspace';

type ScanTarget = 'form-ean' | 'edit-ean' | 'search';
type SortKey =
  | 'name'
  | 'category'
  | 'brand'
  | 'ean_code'
  | 'status'
  | 'current_location'
  | 'purchase_price';
type CustomerSortKey =
  | 'customer_name'
  | 'customer_type'
  | 'contact_person'
  | 'active_loan_count'
  | 'active_loan_value'
  | 'latest_loan';
type TableSortKey = SortKey | CustomerSortKey;
type SortDirection = 'asc' | 'desc';
type CheckoutTab = 'loan' | 'repair';
type AppPage = 'dashboard' | 'customers' | 'protocol';
type CustomerCreateMode = 'checkout' | 'standalone';

type CheckoutFormData = {
  customer_id: number | null;
  borrower: string;
  borrowed_at: string;
  return_date: string;
  loan_notes: string;
  repair_sent_at: string;
  repair_notes: string;
};

type Customer = {
  id: number;
  workspace_id: string;
  customer_type: 'Privatperson' | 'Firma' | 'Selbständig/Freiberuflich';
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

type CustomerRow = {
  customer: Customer;
  activeLoanCount: number;
  activeLoanValue: number;
  latestLoan: string | null;
};

type CustomerFormData = {
  customer_type: Customer['customer_type'];
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  notes: string;
};

type CheckoutLog = {
  id: number;
  workspace_id: string;
  equipment_id: number | null;
  equipment_name: string;
  action_type: 'Verleih' | 'Reparatur';
  customer_id: number | null;
  checked_out_at: string;
  borrower: string | null;
  borrowed_at: string | null;
  return_date: string | null;
  loan_notes: string | null;
  repair_sent_at: string | null;
  repair_notes: string | null;
  checked_in_at: string | null;
  created_at: string;
};

type ProtocolEventKind = 'Verleih' | 'Verlängerung' | 'Reparatur' | 'Check-In';
type ProtocolFilter = 'all' | ProtocolEventKind;

type ProtocolRow = {
  id: string;
  kind: ProtocolEventKind;
  date: string;
  equipmentName: string;
  customerName: string | null;
  primaryDate: string | null;
  secondaryDate: string | null;
  notes: string | null;
  value: number | null;
};

const emptyForm: EquipmentFormData = {
  name: '',
  brand: '',
  model: '',
  serial_number: '',
  ean_code: '',
  category: 'Kamera',
  purchase_date: '',
  purchase_price: null,
  status: 'verfügbar',
  borrower: '',
  borrowed_at: '',
  return_date: '',
  notes: '',
};

const barcodeFormats = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const emptyCheckoutForm: CheckoutFormData = {
  customer_id: null,
  borrower: '',
  borrowed_at: new Date().toISOString().slice(0, 10),
  return_date: '',
  loan_notes: '',
  repair_sent_at: new Date().toISOString().slice(0, 10),
  repair_notes: '',
};

const emptyCustomerForm: CustomerFormData = {
  customer_type: 'Selbständig/Freiberuflich',
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  notes: '',
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoginSaving, setIsLoginSaving] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checkoutLogs, setCheckoutLogs] = useState<CheckoutLog[]>([]);
  const [formData, setFormData] = useState<EquipmentFormData>(emptyForm);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<EquipmentItem | null>(null);
  const [editFormData, setEditFormData] = useState<EquipmentFormData>(emptyForm);
  const [infoItem, setInfoItem] = useState<EquipmentItem | null>(null);
  const [infoLog, setInfoLog] = useState<Record<string, string | null> | null>(null);
  const [customerInfo, setCustomerInfo] = useState<Customer | null>(null);
  const [customerEdit, setCustomerEdit] = useState<Customer | null>(null);
  const [customerEditFormData, setCustomerEditFormData] =
    useState<CustomerFormData>(emptyCustomerForm);
  const [customerLoans, setCustomerLoans] = useState<Customer | null>(null);
  const [copyItem, setCopyItem] = useState<EquipmentItem | null>(null);
  const [copyFormData, setCopyFormData] = useState<EquipmentFormData>(emptyForm);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [customerSortKey, setCustomerSortKey] = useState<CustomerSortKey | null>(null);
  const [customerSortDirection, setCustomerSortDirection] =
    useState<SortDirection>('asc');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState<CheckoutTab>('loan');
  const [checkoutFormData, setCheckoutFormData] =
    useState<CheckoutFormData>(emptyCheckoutForm);
  const [workflowError, setWorkflowError] = useState('');
  const [customerPromptOpen, setCustomerPromptOpen] = useState(false);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [customerCreateMode, setCustomerCreateMode] =
    useState<CustomerCreateMode>('checkout');
  const [customerFormData, setCustomerFormData] =
    useState<CustomerFormData>(emptyCustomerForm);
  const [isCustomerSaving, setIsCustomerSaving] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [activeCheckinNotes, setActiveCheckinNotes] = useState<string[]>([]);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendedReturnDate, setExtendedReturnDate] = useState('');
  const [isWorkflowSaving, setIsWorkflowSaving] = useState(false);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(10);
  const [protocolPage, setProtocolPage] = useState(1);
  const [protocolPageSize, setProtocolPageSize] = useState(10);
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setItems([]);
      setCustomers([]);
      setCheckoutLogs([]);
      setIsLoading(false);
      return;
    }

    void loadEquipment();
    void loadCustomers();
    void loadCheckoutLogs();
  }, [session]);

  useEffect(() => {
    if (!scanTarget) {
      void stopScanner(scannerRef.current);
      scannerRef.current = null;
      return;
    }

    setError('');

    const scanner = new Html5Qrcode('barcode-reader', {
      verbose: false,
      formatsToSupport: barcodeFormats,
      useBarCodeDetectorIfSupported: true,
    });

    scannerRef.current = scanner;

    void scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: { width: 280, height: 170 },
          aspectRatio: 1.777,
          disableFlip: false,
        },
        (decodedText) => {
          const code = normalizeScannedCode(decodedText);

          if (scanTarget === 'search') {
            setSearch(code);
          } else if (scanTarget === 'edit-ean') {
            setEditFormData((current) => ({ ...current, ean_code: code }));
          } else {
            setFormData((current) => ({ ...current, ean_code: code }));
          }

          setScanTarget(null);
        },
        () => {
          return;
        },
      )
      .catch((scanError) => {
        setError(getScannerErrorMessage(scanError));
        setScanTarget(null);
      });

    return () => {
      void stopScanner(scanner).finally(() => {
        if (scannerRef.current === scanner) {
          scannerRef.current = null;
        }
      });
    };
  }, [scanTarget]);

  async function stopScanner(scanner: Html5Qrcode | null) {
    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }

      scanner.clear();
    } catch {
      return;
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    setIsLoginSaving(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (signInError) {
      setLoginError('Login fehlgeschlagen. Bitte prüfe E-Mail und Passwort.');
    } else {
      setLoginPassword('');
    }

    setIsLoginSaving(false);
  }

  function handleLoginKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || isLoginSaving) {
      return;
    }

    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  async function handleLogout() {
    await stopScanner(scannerRef.current);
    scannerRef.current = null;
    setScanTarget(null);
    await supabase.auth.signOut();
    setActivePage('dashboard');
    setSearch('');
    setSelectedIds([]);
    setProfileMenuOpen(false);
  }

  async function loadEquipment() {
    setIsLoading(true);
    setError('');

    const { data, error: loadError } = await supabase
      .from('equipment')
      .select('*')
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .order('created_at', { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      setItems(data ?? []);
    }

    setIsLoading(false);
  }

  async function loadCustomers() {
    const { data, error: loadError } = await supabase
      .from('customers')
      .select('*')
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .order('name', { ascending: true });

    if (loadError) {
      setError(loadError.message);
    } else {
      setCustomers(data ?? []);
    }
  }

  async function loadCheckoutLogs() {
    const { data, error: loadError } = await supabase
      .from('equipment_checkout_logs')
      .select('*')
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .order('created_at', { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      setCheckoutLogs(data ?? []);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) {
      setError('Bitte gib mindestens einen Namen ein.');
      return;
    }

    setIsSaving(true);

    const payload = {
      ...sanitizeEquipmentPayload(formData),
      workspace_id: DEFAULT_WORKSPACE_ID,
      name: formData.name.trim(),
    };

    const { error: insertError } = await supabase.from('equipment').insert(payload);

    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess('Equipment wurde gespeichert.');
      setFormData(emptyForm);
      setCreateFormOpen(false);
      await loadEquipment();
    }

    setIsSaving(false);
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editItem) {
      return;
    }

    setError('');
    setSuccess('');

    if (!editFormData.name.trim()) {
      setError('Bitte gib mindestens einen Namen ein.');
      return;
    }

    setIsUpdating(true);

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        ...sanitizeEquipmentPayload(editFormData),
        name: editFormData.name.trim(),
      })
      .eq('id', editItem.id)
      .eq('workspace_id', DEFAULT_WORKSPACE_ID);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess('Equipment wurde aktualisiert.');
      setEditItem(null);
      setEditFormData(emptyForm);
      await loadEquipment();
    }

    setIsUpdating(false);
  }

  async function handleCopySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!copyFormData.name.trim()) {
      setError('Bitte gib mindestens einen Namen ein.');
      return;
    }

    setIsSaving(true);

    const { error: insertError } = await supabase.from('equipment').insert({
      ...sanitizeEquipmentPayload(copyFormData),
      workspace_id: DEFAULT_WORKSPACE_ID,
      name: copyFormData.name.trim(),
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess('Artikel wurde kopiert.');
      setCopyItem(null);
      setCopyFormData(emptyForm);
      await loadEquipment();
    }

    setIsSaving(false);
  }

  async function handleDeleteSelected() {
    setError('');
    setSuccess('');

    const selectedForDeletion = getSelectedItems();
    const unavailableItems = selectedForDeletion.filter(
      (item) => item.status === 'verliehen' || item.status === 'in Reparatur',
    );

    if (unavailableItems.length > 0) {
      setError(getDeleteBlockedMessage(unavailableItems));
      setDeleteConfirmOpen(false);
      return;
    }

    setIsDeleting(true);

    const { error: deleteError } = await supabase
      .from('equipment')
      .delete()
      .in('id', selectedIds)
      .eq('workspace_id', DEFAULT_WORKSPACE_ID);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSuccess(
        selectedIds.length === 1
          ? 'Ein Artikel wurde gelöscht.'
          : `${selectedIds.length} Artikel wurden gelöscht.`,
      );
      setSelectedIds([]);
      setDeleteConfirmOpen(false);
      await loadEquipment();
    }

    setIsDeleting(false);
  }

  function handleDeleteClick() {
    const unavailableItems = getSelectedItems().filter(
      (item) => item.status === 'verliehen' || item.status === 'in Reparatur',
    );

    if (unavailableItems.length > 0) {
      setWarningMessage(getDeleteBlockedMessage(unavailableItems));
      return;
    }

    setDeleteConfirmOpen(true);
  }

  async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setWorkflowError('');

    if (checkoutTab === 'loan' && !checkoutFormData.borrower.trim()) {
      setWorkflowError('Bitte gib an, an wen die Artikel ausgeliehen werden.');
      return;
    }

    if (checkoutTab === 'loan' && !checkoutFormData.borrowed_at) {
      setWorkflowError('Bitte gib das Datum für den Verleihbeginn an.');
      return;
    }

    if (checkoutTab === 'loan' && !checkoutFormData.return_date) {
      setWorkflowError('Bitte gib das geplante Rückgabedatum an.');
      return;
    }

    if (
      checkoutTab === 'loan' &&
      !isDateAfter(checkoutFormData.return_date, checkoutFormData.borrowed_at)
    ) {
      setWorkflowError(
        'Das Rückgabedatum muss nach dem Verleihbeginn liegen.',
      );
      return;
    }

    if (checkoutTab === 'repair' && !checkoutFormData.repair_sent_at) {
      setWorkflowError('Bitte gib das Versanddatum für die Reparatur an.');
      return;
    }

    if (checkoutTab === 'loan' && !checkoutFormData.customer_id) {
      const exactCustomer = findCustomerByBorrowerValue(checkoutFormData.borrower);

      if (exactCustomer) {
        const nextCheckoutFormData = {
          ...checkoutFormData,
          customer_id: exactCustomer.id,
          borrower: getCustomerDisplayName(exactCustomer),
        };

        setCheckoutFormData(nextCheckoutFormData);
        await saveCheckout(nextCheckoutFormData);
        return;
      }

      setCustomerPromptOpen(true);
      return;
    }

    await saveCheckout(checkoutFormData);
  }

  async function saveCheckout(data: CheckoutFormData) {
    setIsWorkflowSaving(true);
    const status: EquipmentStatus = checkoutTab === 'loan' ? 'verliehen' : 'in Reparatur';
    const selectedItems = getSelectedItems();
    const selectedCustomer = data.customer_id
      ? customers.find((customer) => customer.id === data.customer_id)
      : null;
    const borrowerName = selectedCustomer
      ? getCustomerDisplayName(selectedCustomer)
      : data.borrower.trim();
    const { error: updateError } = await supabase
      .from('equipment')
      .update(
        checkoutTab === 'loan'
          ? {
              status,
              borrower: borrowerName,
              borrowed_at: data.borrowed_at || null,
              return_date: data.return_date || null,
            }
          : {
              status,
              borrower: null,
              borrowed_at: null,
              return_date: null,
              notes: checkoutFormData.repair_notes || null,
            },
      )
      .in('id', selectedIds)
      .eq('workspace_id', DEFAULT_WORKSPACE_ID);

    if (updateError) {
      setError(updateError.message);
      setIsWorkflowSaving(false);
      return;
    }

    const checkedOutAt = new Date().toISOString();
    const logRows = selectedItems.map((item) => ({
      workspace_id: DEFAULT_WORKSPACE_ID,
      equipment_id: item.id,
      equipment_name: item.name,
      action_type: checkoutTab === 'loan' ? 'Verleih' : 'Reparatur',
      checked_out_at: checkedOutAt,
      customer_id: checkoutTab === 'loan' ? data.customer_id : null,
      borrower: checkoutTab === 'loan' ? borrowerName : null,
      borrowed_at: checkoutTab === 'loan' ? data.borrowed_at || null : null,
      return_date: checkoutTab === 'loan' ? data.return_date || null : null,
      loan_notes: checkoutTab === 'loan' ? data.loan_notes || null : null,
      repair_sent_at:
        checkoutTab === 'repair' ? data.repair_sent_at || null : null,
      repair_notes:
        checkoutTab === 'repair' ? data.repair_notes || null : null,
      checked_in_at: null,
    }));

    const { error: logError } = await supabase
      .from('equipment_checkout_logs')
      .insert(logRows);

    if (logError) {
      setError(logError.message);
    } else {
      setSuccess(
        checkoutTab === 'loan'
          ? 'Check-Out als Verleih wurde gespeichert.'
          : 'Check-Out als Reparatur wurde gespeichert.',
      );
      setCheckoutOpen(false);
      setCheckoutFormData(emptyCheckoutForm);
      setSelectedIds([]);
      await loadEquipment();
      await loadCheckoutLogs();
    }

    setIsWorkflowSaving(false);
  }

  function findCustomerByBorrowerValue(value: string) {
    const normalizedValue = value.trim().toLowerCase();

    return customers.find((customer) => {
      return (
        getCustomerDisplayName(customer).toLowerCase() === normalizedValue ||
        getCustomerOptionLabel(customer).toLowerCase() === normalizedValue
      );
    });
  }

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkflowError('');

    if (!customerFormData.name.trim()) {
      setWorkflowError('Bitte gib einen Namen oder Firmennamen ein.');
      return;
    }

    setIsCustomerSaving(true);

    const { data, error: insertError } = await supabase
      .from('customers')
      .insert({
        workspace_id: DEFAULT_WORKSPACE_ID,
        customer_type: customerFormData.customer_type,
        name: customerFormData.name.trim(),
        contact_person:
          customerFormData.customer_type === 'Firma'
            ? customerFormData.contact_person || null
            : null,
        email: customerFormData.email || null,
        phone: customerFormData.phone || null,
        notes: customerFormData.notes || null,
      })
      .select('*')
      .single();

    if (insertError) {
      setWorkflowError(insertError.message);
      setIsCustomerSaving(false);
      return;
    }

    const createdCustomer = data as Customer;
    setCustomers((current) =>
      [...current, createdCustomer].sort((first, second) =>
        first.name.localeCompare(second.name, 'de'),
      ),
    );

    if (customerCreateMode === 'standalone') {
      setCustomerCreateOpen(false);
      setCustomerFormData(emptyCustomerForm);
      setIsCustomerSaving(false);
      setSuccess('Kunde wurde angelegt.');
      return;
    }

    const nextCheckoutFormData = {
      ...checkoutFormData,
      customer_id: createdCustomer.id,
      borrower: getCustomerDisplayName(createdCustomer),
    };

    setCheckoutFormData(nextCheckoutFormData);
    setCustomerCreateOpen(false);
    setCustomerPromptOpen(false);
    setCustomerFormData(emptyCustomerForm);
    setIsCustomerSaving(false);
    await saveCheckout(nextCheckoutFormData);
  }

  async function handleUpdateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!customerEdit) {
      return;
    }

    setError('');

    if (!customerEditFormData.name.trim()) {
      setError('Bitte gib einen Namen oder Firmennamen ein.');
      return;
    }

    setIsUpdating(true);

    const { data, error: updateError } = await supabase
      .from('customers')
      .update({
        customer_type: customerEditFormData.customer_type,
        name: customerEditFormData.name.trim(),
        contact_person:
          customerEditFormData.customer_type === 'Firma'
            ? customerEditFormData.contact_person || null
            : null,
        email: customerEditFormData.email || null,
        phone: customerEditFormData.phone || null,
        notes: customerEditFormData.notes || null,
      })
      .eq('id', customerEdit.id)
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .select('*')
      .single();

    if (updateError) {
      setError(updateError.message);
    } else {
      const updatedCustomer = data as Customer;
      setCustomers((current) =>
        current
          .map((customer) =>
            customer.id === updatedCustomer.id ? updatedCustomer : customer,
          )
          .sort((first, second) => first.name.localeCompare(second.name, 'de')),
      );
      setCustomerEdit(null);
      setCustomerEditFormData(emptyCustomerForm);
      setSuccess('Kunde wurde aktualisiert.');
    }

    setIsUpdating(false);
  }

  function openCustomerEdit(customer: Customer) {
    setCustomerEdit(customer);
    setCustomerEditFormData(customerToFormData(customer));
  }

  async function openCheckinModal() {
    setError('');
    const selectedForCheckin = getSelectedItems();
    const hasLoanItems = selectedForCheckin.some((item) => item.status === 'verliehen');
    const hasRepairItems = selectedForCheckin.some(
      (item) => item.status === 'in Reparatur',
    );

    if (hasLoanItems && hasRepairItems) {
      setError(
        'Bitte Check-In getrennt durchführen: Verliehene Artikel und Artikel in Reparatur können nicht gemeinsam eingecheckt werden.',
      );
      return;
    }

    const activeActionType = hasRepairItems ? 'Reparatur' : 'Verleih';

    const { data, error: logError } = await supabase
      .from('equipment_checkout_logs')
      .select('equipment_name, loan_notes, repair_notes')
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .in(
        'equipment_id',
        selectedForCheckin.map((item) => item.id),
      )
      .eq('action_type', activeActionType)
      .is('checked_in_at', null);

    if (logError) {
      setError(logError.message);
      return;
    } else {
      setActiveCheckinNotes(
        (data ?? [])
          .map((row) => ({
            name: row.equipment_name,
            note:
              activeActionType === 'Reparatur' ? row.repair_notes : row.loan_notes,
          }))
          .filter((row) => row.note)
          .map((row) => `${row.name}: ${row.note}`),
      );
    }

    setCheckinOpen(true);
  }

  function handleCheckinClick() {
    const selectedForCheckin = getSelectedItems();
    const hasLoanItems = selectedForCheckin.some((item) => item.status === 'verliehen');
    const hasRepairItems = selectedForCheckin.some(
      (item) => item.status === 'in Reparatur',
    );

    if (hasLoanItems && hasRepairItems) {
      setWarningMessage(
        'Bitte Check-In getrennt durchführen: Verliehene Artikel und Artikel in Reparatur können nicht gemeinsam eingecheckt werden.',
      );
      return;
    }

    void openCheckinModal();
  }

  async function handleCheckin() {
    setError('');
    setSuccess('');
    setIsWorkflowSaving(true);

    const checkedInAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('equipment')
      .update({
        status: 'verfügbar',
        borrower: null,
        borrowed_at: null,
        return_date: null,
      })
      .in('id', selectedIds)
      .eq('workspace_id', DEFAULT_WORKSPACE_ID);

    if (updateError) {
      setError(updateError.message);
      setIsWorkflowSaving(false);
      return;
    }

    const { error: logError } = await supabase
      .from('equipment_checkout_logs')
      .update({ checked_in_at: checkedInAt })
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .in('equipment_id', selectedIds)
      .is('checked_in_at', null);

    if (logError) {
      setError(logError.message);
    } else {
      setSuccess('Check-In wurde gespeichert.');
      setCheckinOpen(false);
      setSelectedIds([]);
      setActiveCheckinNotes([]);
      await loadEquipment();
      await loadCheckoutLogs();
    }

    setIsWorkflowSaving(false);
  }

  function handleExtendClick() {
    const selectedForExtension = getSelectedItems();
    const currentReturnDates = selectedForExtension
      .map((item) => item.return_date)
      .filter(Boolean)
      .sort();

    setExtendedReturnDate(currentReturnDates[currentReturnDates.length - 1] ?? '');
    setWorkflowError('');
    setExtendOpen(true);
  }

  async function handleExtendLoan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setWorkflowError('');

    if (!extendedReturnDate) {
      setWorkflowError('Bitte gib ein neues Rückgabedatum an.');
      return;
    }

    const selectedForExtension = getSelectedItems();
    const invalidItem = selectedForExtension.find(
      (item) => item.borrowed_at && isDateBefore(extendedReturnDate, item.borrowed_at),
    );

    if (invalidItem) {
      setWorkflowError(
        `Das neue Rückgabedatum darf nicht vor dem Verleihbeginn von "${invalidItem.name}" liegen.`,
      );
      return;
    }

    const notExtendedItem = selectedForExtension.find(
      (item) =>
        item.return_date &&
        !isDateAfter(extendedReturnDate, item.return_date),
    );

    if (notExtendedItem) {
      setWorkflowError(
        `Das neue Rückgabedatum muss nach dem bisherigen Rückgabedatum von "${notExtendedItem.name}" liegen.`,
      );
      return;
    }

    setIsWorkflowSaving(true);

    const { data: activeLogs, error: activeLogError } = await supabase
      .from('equipment_checkout_logs')
      .select('equipment_id, customer_id')
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .in('equipment_id', selectedIds)
      .eq('action_type', 'Verleih')
      .is('checked_in_at', null);

    if (activeLogError) {
      setError(activeLogError.message);
      setIsWorkflowSaving(false);
      return;
    }

    const customerIdByEquipmentId = new Map(
      (activeLogs ?? []).map((row) => [row.equipment_id, row.customer_id]),
    );

    const { error: updateError } = await supabase
      .from('equipment')
      .update({ return_date: extendedReturnDate })
      .in('id', selectedIds)
      .eq('workspace_id', DEFAULT_WORKSPACE_ID);

    if (updateError) {
      setError(updateError.message);
      setIsWorkflowSaving(false);
      return;
    }

    const checkedOutAt = new Date().toISOString();
    const logRows = selectedForExtension.map((item) => ({
      workspace_id: DEFAULT_WORKSPACE_ID,
      equipment_id: item.id,
      equipment_name: item.name,
      action_type: 'Verleih',
      checked_out_at: checkedOutAt,
      customer_id: customerIdByEquipmentId.get(item.id) ?? null,
      borrower: item.borrower,
      borrowed_at: item.borrowed_at,
      return_date: extendedReturnDate,
      loan_notes: null,
      repair_sent_at: null,
      repair_notes: null,
      checked_in_at: null,
    }));

    const { error: logError } = await supabase
      .from('equipment_checkout_logs')
      .insert(logRows);

    if (logError) {
      setError(logError.message);
    } else {
      setSuccess('Verleih wurde verlängert.');
      setExtendOpen(false);
      setExtendedReturnDate('');
      setSelectedIds([]);
      await loadEquipment();
      await loadCheckoutLogs();
    }

    setIsWorkflowSaving(false);
  }

  function updateField<K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K],
  ) {
    setFormData((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateEditField<K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K],
  ) {
    setEditFormData((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateCopyField<K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K],
  ) {
    setCopyFormData((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function openEditModal(item: EquipmentItem) {
    setEditItem(item);
    setEditFormData(itemToFormData(item));
  }

  function openCopyModal(item: EquipmentItem) {
    setCopyItem(item);
    setCopyFormData(itemToCopyFormData(item));
  }

  async function openInfoModal(item: EquipmentItem) {
    setInfoItem(item);
    setInfoLog(null);
    setError('');

    const actionType = item.status === 'in Reparatur' ? 'Reparatur' : 'Verleih';
    const { data, error: logError } = await supabase
      .from('equipment_checkout_logs')
      .select('*')
      .eq('workspace_id', DEFAULT_WORKSPACE_ID)
      .eq('equipment_id', item.id)
      .eq('action_type', actionType)
      .is('checked_in_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logError) {
      setError(logError.message);
    } else {
      setInfoLog(data ?? null);
    }
  }

  function getSelectedItems() {
    return items.filter((item) => selectedIds.includes(item.id));
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function toggleAllVisible(checked: boolean) {
    const visiblePageIds = visibleInventoryItems.map((item) => item.id);

    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visiblePageIds]));
      }

      return current.filter((id) => !visiblePageIds.includes(id));
    });
  }

  function changeSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(nextSortKey);
      setSortDirection('asc');
    }
  }

  function changeCustomerSort(nextSortKey: CustomerSortKey) {
    if (customerSortKey === nextSortKey) {
      if (customerSortDirection === 'asc') {
        setCustomerSortDirection('desc');
      } else {
        setCustomerSortKey(null);
        setCustomerSortDirection('asc');
      }
    } else {
      setCustomerSortKey(nextSortKey);
      setCustomerSortDirection('asc');
    }
  }

  function scrollToForm() {
    if (activePage === 'customers') {
      setWorkflowError('');
      setCustomerCreateMode('standalone');
      setCustomerFormData(emptyCustomerForm);
      setCustomerCreateOpen(true);
      return;
    }

    setCreateFormOpen(true);
  }

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = items.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          item.name,
          item.brand,
          item.model,
          item.serial_number,
          item.ean_code,
          item.borrower,
          item.notes,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));

      const matchesCategory =
        categoryFilter === 'all' || item.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });

    return [...filtered].sort((first, second) => {
      if (!sortKey) {
        return (
          new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
        );
      }

      return compareEquipmentItems(first, second, sortKey, sortDirection);
    });
  }, [categoryFilter, items, search, sortDirection, sortKey, statusFilter]);

  const totalValue = useMemo(() => {
    return visibleItems.reduce((sum, item) => sum + (item.purchase_price ?? 0), 0);
  }, [visibleItems]);

  const inventoryPageCount = Math.max(1, Math.ceil(visibleItems.length / inventoryPageSize));
  const visibleInventoryItems = useMemo(() => {
    const firstIndex = (inventoryPage - 1) * inventoryPageSize;
    return visibleItems.slice(firstIndex, firstIndex + inventoryPageSize);
  }, [inventoryPage, inventoryPageSize, visibleItems]);
  const inventoryStart = visibleItems.length
    ? (inventoryPage - 1) * inventoryPageSize + 1
    : 0;
  const inventoryEnd = Math.min(inventoryPage * inventoryPageSize, visibleItems.length);

  const statusCounts = useMemo(() => {
    return statuses.reduce(
      (counts, status) => ({
        ...counts,
        [status]: visibleItems.filter((item) => item.status === status).length,
      }),
      {} as Record<EquipmentStatus, number>,
    );
  }, [visibleItems]);

  const overdueReturnCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return visibleItems.filter((item) => {
      if (item.status !== 'verliehen' || !item.return_date) {
        return false;
      }

      const returnDate = new Date(item.return_date);
      returnDate.setHours(0, 0, 0, 0);

      return returnDate < today;
    }).length;
  }, [visibleItems]);

  const selectedRows = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );
  const canCheckout =
    selectedRows.length > 0 &&
    selectedRows.every((item) => item.status === 'verfügbar');
  const canCheckin =
    selectedRows.length > 0 &&
    selectedRows.every(
      (item) => item.status === 'verliehen' || item.status === 'in Reparatur',
    );
  const canExtend =
    selectedRows.length > 0 && selectedRows.every((item) => item.status === 'verliehen');

  const customerRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const rows = customers.filter((customer) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        customer.name,
        customer.customer_type,
        customer.contact_person,
        customer.email,
        customer.phone,
        customer.notes,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch));
    }).map((customer) => {
      const activeLogs = checkoutLogs.filter(
        (log) =>
          log.customer_id === customer.id &&
          log.action_type === 'Verleih' &&
          !log.checked_in_at &&
          isLatestActiveLog(log, checkoutLogs),
      );
      const activeLoanValue = activeLogs.reduce((sum, log) => {
        const item = items.find((equipment) => equipment.id === log.equipment_id);
        return sum + (item?.purchase_price ?? 0);
      }, 0);
      const latestLoanDates = activeLogs
        .map((log) => log.borrowed_at ?? log.checked_out_at)
        .filter(Boolean)
        .sort();
      const latestLoan = latestLoanDates[latestLoanDates.length - 1];

      return {
        customer,
        activeLoanCount: activeLogs.length,
        activeLoanValue,
        latestLoan: latestLoan ?? null,
      };
    });

    return rows.sort((first, second) => {
      if (!customerSortKey) {
        return first.customer.name.localeCompare(second.customer.name, 'de');
      }

      return compareCustomerRows(
        first,
        second,
        customerSortKey,
        customerSortDirection,
      );
    });
  }, [
    checkoutLogs,
    customerSortDirection,
    customerSortKey,
    customers,
    items,
    search,
  ]);

  const selectedCustomerLoanRows = useMemo(() => {
    if (!customerLoans) {
      return [];
    }

    return checkoutLogs
      .filter(
        (log) =>
          log.customer_id === customerLoans.id &&
          log.action_type === 'Verleih' &&
          !log.checked_in_at &&
          isLatestActiveLog(log, checkoutLogs),
      )
      .map((log) => ({
        log,
        item: items.find((equipment) => equipment.id === log.equipment_id),
      }));
  }, [checkoutLogs, customerLoans, items]);

  const customerSuggestions = useMemo(() => {
    const normalizedBorrower = checkoutFormData.borrower.trim().toLowerCase();

    if (!normalizedBorrower) {
      return [];
    }

    const seenLabels = new Set<string>();

    return customers.filter((customer) => {
      const optionLabel = getCustomerOptionLabel(customer);
      const matches = optionLabel.toLowerCase().includes(normalizedBorrower);

      if (!matches || seenLabels.has(optionLabel)) {
        return false;
      }

      seenLabels.add(optionLabel);
      return true;
    });
  }, [checkoutFormData.borrower, customers]);

  const protocolRows = useMemo(() => {
    const rows = checkoutLogs.flatMap((log) =>
      createProtocolRows(
        log,
        checkoutLogs,
        items.find((item) => item.id === log.equipment_id)?.purchase_price ?? null,
      ),
    );

    return rows.sort(
      (first, second) => new Date(second.date).getTime() - new Date(first.date).getTime(),
    );
  }, [checkoutLogs, items]);
  const filteredProtocolRows = useMemo(() => {
    const searchTerms = getSearchTerms(search);

    return protocolRows.filter((row) => {
      const matchesFilter = protocolFilter === 'all' || row.kind === protocolFilter;
      const matchesSearch =
        searchTerms.length === 0 ||
        matchesAllSearchTerms(
          [
            row.kind,
            row.equipmentName,
            row.customerName,
            row.primaryDate ? formatDate(row.primaryDate) : null,
            row.secondaryDate ? formatDate(row.secondaryDate) : null,
            row.notes,
            row.value !== null ? currencyFormatter.format(row.value) : null,
            formatDateTime(row.date),
          ],
          searchTerms,
        );

      return matchesFilter && matchesSearch;
    });
  }, [protocolFilter, protocolRows, search]);

  const searchPlaceholder =
    activePage === 'customers'
      ? 'Suche nach Name, Firma, Kontakt, E-Mail, Telefon...'
      : activePage === 'protocol'
        ? 'Suche im Protokoll, z.B. FX6 Verleih...'
        : 'Suche nach Name, Marke, Modell, Seriennummer, EAN...';

  const topSearchClassName = [
    'top-search',
    activePage !== 'dashboard' ? 'no-scan' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const protocolPageCount = Math.max(
    1,
    Math.ceil(filteredProtocolRows.length / protocolPageSize),
  );
  const visibleProtocolRows = useMemo(() => {
    const firstIndex = (protocolPage - 1) * protocolPageSize;
    return filteredProtocolRows.slice(firstIndex, firstIndex + protocolPageSize);
  }, [filteredProtocolRows, protocolPage, protocolPageSize]);
  const protocolStart = filteredProtocolRows.length
    ? (protocolPage - 1) * protocolPageSize + 1
    : 0;
  const protocolEnd = Math.min(
    protocolPage * protocolPageSize,
    filteredProtocolRows.length,
  );

  useEffect(() => {
    setInventoryPage((currentPage) => Math.min(currentPage, inventoryPageCount));
  }, [inventoryPageCount]);

  useEffect(() => {
    setProtocolPage((currentPage) => Math.min(currentPage, protocolPageCount));
  }, [protocolPageCount]);

  if (isAuthLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <img className="auth-logo" src="/brand/hildmedia-logo-black-gray.png" alt="Hildmedia" />
          <p>Login wird geprüft...</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <img className="auth-logo" src="/brand/hildmedia-logo-black-gray.png" alt="Hildmedia" />
          <div className="auth-intro">
            <p>Bitte einloggen, um auf die Inventarverwaltung zugreifen zu können.</p>
          </div>

          <form onSubmit={handleLogin} onKeyDown={handleLoginKeyDown}>
            <label>
              E-Mail
              <input
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label>
              Passwort
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button className="primary-button full-width-action" type="submit" disabled={isLoginSaving}>
              {isLoginSaving ? 'Meldet an...' : 'Einloggen'}
            </button>

            {loginError && <div className="modal-error">{loginError}</div>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <img src="/brand/hildmedia-emblem-white.svg" alt="Hildmedia" />
        </div>

        <nav className="main-nav" aria-label="Hauptnavigation">
          <button
            className={activePage === 'dashboard' ? 'active' : ''}
            type="button"
            onClick={() => setActivePage('dashboard')}
          >
            Inventar
          </button>
          <button
            className={activePage === 'customers' ? 'active' : ''}
            type="button"
            onClick={() => setActivePage('customers')}
          >
            Kunden
          </button>
          <button
            className={activePage === 'protocol' ? 'active' : ''}
            type="button"
            onClick={() => setActivePage('protocol')}
          >
            Protokoll
          </button>
        </nav>

        <div
          className={`top-actions ${activePage === 'protocol' ? 'without-add' : ''}`}
        >
          <div className={topSearchClassName}>
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
            />
            {activePage === 'dashboard' && (
              <button type="button" onClick={() => setScanTarget('search')}>
                Scan
              </button>
            )}
          </div>

          {activePage !== 'protocol' && (
            <button className="icon-button" type="button" onClick={scrollToForm}>
              <PlusIcon />
            </button>
          )}

          <div className="profile-menu-wrap">
            <button
              className="profile-button"
              type="button"
              onClick={() => setProfileMenuOpen((current) => !current)}
              aria-label="Profilmenü öffnen"
            >
              <ProfileIcon />
            </button>

            {profileMenuOpen && (
              <div className="profile-menu">
                <span>{session.user.email}</span>
                <button type="button" onClick={() => void handleLogout()}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <div className="message error">{error}</div>}
      {success && <div className="message success">{success}</div>}

      {activePage === 'dashboard' && (
        <>
      <section className="dashboard-grid" aria-label="Inventar Kennzahlen">
        <article className="status-overview">
          <h2>Status Übersicht</h2>
          <StatusLine status="verfügbar" count={statusCounts['verfügbar']} />
          <StatusLine status="verliehen" count={statusCounts.verliehen} />
          {overdueReturnCount > 0 && (
            <div className="status-line overdue-line">
              <span className="status-dot overdue" />
              <span>
                <span className="warning-mark">!</span>
                Davon überfällige
              </span>
              <strong>{overdueReturnCount}</strong>
            </div>
          )}
          <StatusLine status="in Reparatur" count={statusCounts['in Reparatur']} />
        </article>

        <article className="metric-card">
          <span className="metric-icon cube-icon" aria-hidden="true">
            □
          </span>
          <div>
            <p>Gesamtanzahl Artikel</p>
            <strong>{visibleItems.length}</strong>
          </div>
        </article>

        <article className="metric-card">
          <span className="metric-icon value-icon" aria-hidden="true">
            €
          </span>
          <div>
            <p>Gesamtwert Inventar</p>
            <strong>{currencyFormatter.format(totalValue)}</strong>
            <small>Basierend auf Kaufpreis</small>
          </div>
        </article>
      </section>

      <section className="inventory-panel">
        <div className="panel-header">
          <h1>Inventar</h1>
          <div className="panel-filters">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">Alle Kategorien</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Alle Status</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="panel-actions">
            {canCheckout && (
              <button
                className="workflow-button"
                type="button"
                onClick={() => setCheckoutOpen(true)}
              >
                Check-Out
              </button>
            )}
            {canCheckin && (
              <button
                className="workflow-button"
                type="button"
                onClick={handleCheckinClick}
              >
                Check-In
              </button>
            )}
            {canExtend && (
              <button
                className="workflow-button"
                type="button"
                onClick={handleExtendClick}
              >
                Verlängern
              </button>
            )}
            <button
              className={`danger-icon-button ${selectedIds.length === 0 ? 'is-hidden' : ''}`}
              type="button"
              onClick={handleDeleteClick}
              aria-label="Ausgewählte Artikel löschen"
              disabled={selectedIds.length === 0}
            >
              <TrashIcon />
            </button>
            <span>
              Zeige {inventoryStart} bis {inventoryEnd} von {visibleItems.length} Artikeln
            </span>
          </div>
        </div>

        {isLoading ? (
          <p className="empty-state">Inventar wird geladen...</p>
        ) : visibleItems.length === 0 ? (
          <p className="empty-state">Keine Equipment-Einträge gefunden.</p>
        ) : (
          <div className="table-wrap responsive-table">
            <table>
              <thead>
                <tr>
                  <th className="select-cell">
                    <input
                      type="checkbox"
                      checked={
                        visibleInventoryItems.length > 0 &&
                        visibleInventoryItems.every((item) =>
                          selectedIds.includes(item.id),
                        )
                      }
                      onChange={(event) => toggleAllVisible(event.target.checked)}
                      aria-label="Alle sichtbaren Artikel auswählen"
                    />
                  </th>
                  <SortableTh
                    label="Name"
                    sortKeyValue="name"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <SortableTh
                    label="Kategorie"
                    sortKeyValue="category"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <SortableTh
                    label="Marke"
                    sortKeyValue="brand"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <SortableTh
                    label="EAN"
                    sortKeyValue="ean_code"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <SortableTh
                    label="Status"
                    sortKeyValue="status"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <SortableTh
                    label="Standort / Besitzer"
                    sortKeyValue="current_location"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <SortableTh
                    label="Kaufpreis"
                    sortKeyValue="purchase_price"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={changeSort}
                  />
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {visibleInventoryItems.map((item) => (
                  <tr key={item.id}>
                    <td className="select-cell" data-label="Auswahl">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`${item.name} auswählen`}
                      />
                    </td>
                    <td className="name-cell" data-label="Name">{item.name}</td>
                    <td data-label="Kategorie">{item.category}</td>
                    <td data-label="Marke">{item.brand || '-'}</td>
                    <td data-label="EAN">{item.ean_code || '-'}</td>
                    <td data-label="Status">
                      <span className={`status ${statusClassName(item.status)}`}>
                        {item.status}
                      </span>
                      {isOverdue(item) && (
                        <span
                          className="warning-mark table-warning"
                          title="Rückgabe überfällig"
                        >
                          !
                        </span>
                      )}
                    </td>
                    <td data-label="Standort / Besitzer">{getCurrentLocation(item)}</td>
                    <td data-label="Kaufpreis">
                      {item.purchase_price
                        ? currencyFormatter.format(item.purchase_price)
                        : '-'}
                    </td>
                    <td data-label="Aktionen">
                      <div className="row-actions">
                        <button
                          className="table-icon-button"
                          type="button"
                          onClick={() => openEditModal(item)}
                          aria-label={`${item.name} anpassen`}
                        >
                          <AdjustIcon />
                        </button>
                        <button
                          className="table-icon-button"
                          type="button"
                          onClick={() => openCopyModal(item)}
                          aria-label={`${item.name} kopieren`}
                        >
                          <CopyIcon />
                        </button>
                        {(item.status === 'verliehen' ||
                          item.status === 'in Reparatur') && (
                          <button
                            className="table-icon-button"
                            type="button"
                            onClick={() => void openInfoModal(item)}
                            aria-label={`${item.name} Informationen anzeigen`}
                          >
                            <InfoIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {visibleItems.length > 0 && (
          <div className="list-pagination">
            <div className="pagination-buttons">
              <button
                type="button"
                disabled={inventoryPage === 1}
                onClick={() => setInventoryPage((current) => Math.max(1, current - 1))}
              >
                Zurück
              </button>
              <span>
                Seite {inventoryPage} von {inventoryPageCount}
              </span>
              <button
                type="button"
                disabled={inventoryPage === inventoryPageCount}
                onClick={() =>
                  setInventoryPage((current) =>
                    Math.min(inventoryPageCount, current + 1),
                  )
                }
              >
                Weiter
              </button>
            </div>

            <label>
              Einträge pro Seite
              <select
                value={inventoryPageSize}
                onChange={(event) => {
                  setInventoryPageSize(Number(event.target.value));
                  setInventoryPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        )}
      </section>

      {createFormOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="edit-modal">
            <div className="form-header">
              <h2>Equipment hinzufügen</h2>
              <button type="button" onClick={() => setCreateFormOpen(false)}>
                Schließen
              </button>
            </div>

            <EquipmentForm
              data={formData}
              isSaving={isSaving}
              submitLabel={isSaving ? 'Speichert...' : 'Equipment speichern'}
              onSubmit={handleSubmit}
              onChange={updateField}
              onScanEan={() => setScanTarget('form-ean')}
            />
          </section>
        </div>
      )}

      {scanTarget && (
        <div className="scanner-backdrop" role="dialog" aria-modal="true">
          <section className="scanner-modal">
            <div className="scanner-header">
              <h2>
                {scanTarget === 'search'
                  ? 'Barcode für Suche scannen'
                  : 'Barcode für Artikel scannen'}
              </h2>
              <button type="button" onClick={() => setScanTarget(null)}>
                Schließen
              </button>
            </div>
            <p className="scanner-hint">
              Halte den EAN-Code gut beleuchtet und möglichst gerade in den Rahmen.
            </p>
            <div className="scanner-frame">
              <div className="scanner-placeholder">Kamera wird gestartet...</div>
              <div id="barcode-reader" />
            </div>
          </section>
        </div>
      )}

      {editItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="edit-modal">
            <div className="form-header">
              <div>
                <h2>Artikel anpassen</h2>
                <p className="modal-subline">
                  Erstellt: {formatDateTime(editItem.created_at)} · Geändert:{' '}
                  {formatDateTime(editItem.updated_at ?? editItem.created_at)}
                </p>
              </div>
              <button type="button" onClick={() => setEditItem(null)}>
                Schließen
              </button>
            </div>

            <EquipmentForm
              data={editFormData}
              isSaving={isUpdating}
              submitLabel={isUpdating ? 'Speichert...' : 'Änderungen speichern'}
              onSubmit={handleUpdate}
              onChange={updateEditField}
              onScanEan={() => setScanTarget('edit-ean')}
            />
          </section>
        </div>
      )}

      {copyItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="edit-modal">
            <div className="form-header">
              <div>
                <div className="modal-title-row">
                  <h2>Artikel kopieren</h2>
                  <span className="new-badge">Neu</span>
                </div>
                <p className="modal-subline">
                  Vorlage: {copyItem.name}. Seriennummer und EAN bleiben leer.
                </p>
              </div>
              <button type="button" onClick={() => setCopyItem(null)}>
                Schließen
              </button>
            </div>

            <EquipmentForm
              data={copyFormData}
              isSaving={isSaving}
              submitLabel={isSaving ? 'Speichert...' : 'Kopie speichern'}
              onSubmit={handleCopySubmit}
              onChange={updateCopyField}
            />
          </section>
        </div>
      )}

      {infoItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal workflow-modal">
            <div className="form-header">
              <div>
                <h2>Info</h2>
                <p className="modal-subline">{infoItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInfoItem(null);
                  setInfoLog(null);
                }}
              >
                Schließen
              </button>
            </div>

            {infoItem.status === 'verliehen' ? (
              <div className="info-list">
                <InfoRow label="Status" value="Verliehen" />
                <InfoRow label="Ausgeliehen an" value={infoItem.borrower} />
                <InfoRow label="Verleihbeginn" value={formatDate(infoItem.borrowed_at)} />
                <InfoRow label="Rückgabedatum" value={formatDate(infoItem.return_date)} />
                <InfoRow label="Notizen Verleih" value={infoLog?.loan_notes} />
              </div>
            ) : (
              <div className="info-list">
                <InfoRow label="Status" value="In Reparatur" />
                <InfoRow
                  label="Versanddatum"
                  value={formatDate(infoLog?.repair_sent_at ?? null)}
                />
                <InfoRow label="Notizen Reparatur" value={infoLog?.repair_notes} />
              </div>
            )}
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal workflow-modal">
            <div className="form-header">
              <div>
                <h2>Check-Out</h2>
                <p className="modal-subline">
                  {selectedIds.length}{' '}
                  {selectedIds.length === 1 ? 'Artikel ausgewählt' : 'Artikel ausgewählt'}
                </p>
              </div>
              <button type="button" onClick={() => setCheckoutOpen(false)}>
                Schließen
              </button>
            </div>

            <div className="tabs">
              <button
                className={checkoutTab === 'loan' ? 'active' : ''}
                type="button"
                onClick={() => {
                  setCheckoutTab('loan');
                  setWorkflowError('');
                }}
              >
                Verleih
              </button>
              <button
                className={checkoutTab === 'repair' ? 'active' : ''}
                type="button"
                onClick={() => {
                  setCheckoutTab('repair');
                  setWorkflowError('');
                }}
              >
                Reparatur
              </button>
            </div>

            <form className="workflow-form" onSubmit={handleCheckout}>
              {checkoutTab === 'loan' ? (
                <>
                  <label>
                    Ausgeliehen an *
                    <input
                      list="customer-suggestions"
                      value={checkoutFormData.borrower}
                      onChange={(event) => {
                        const borrower = event.target.value;
                        const selectedCustomer = findCustomerByBorrowerValue(borrower);

                        setCheckoutFormData((current) => ({
                          ...current,
                          borrower,
                          customer_id: selectedCustomer?.id ?? null,
                        }));
                      }}
                      required
                    />
                    <datalist id="customer-suggestions">
                      {customerSuggestions.map((customer) => (
                        <option
                          key={customer.id}
                          value={getCustomerOptionLabel(customer)}
                        />
                      ))}
                    </datalist>
                  </label>
                  <div className="date-row">
                    <label>
                      Verleihbeginn *
                      <input
                        type="date"
                        value={checkoutFormData.borrowed_at}
                        onChange={(event) =>
                          setCheckoutFormData((current) => ({
                            ...current,
                            borrowed_at: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Rückgabedatum *
                      <input
                        type="date"
                        value={checkoutFormData.return_date}
                        onChange={(event) =>
                          setCheckoutFormData((current) => ({
                            ...current,
                            return_date: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  </div>
                  <label className="notes-field">
                    Notizen Verleih
                    <textarea
                      value={checkoutFormData.loan_notes}
                      onChange={(event) =>
                        setCheckoutFormData((current) => ({
                          ...current,
                          loan_notes: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Zubehör, Zustand, Besonderheiten beim Verleih..."
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Versanddatum *
                    <input
                      type="date"
                      value={checkoutFormData.repair_sent_at}
                      onChange={(event) =>
                        setCheckoutFormData((current) => ({
                          ...current,
                          repair_sent_at: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="notes-field">
                    Notizen Reparatur
                    <textarea
                      value={checkoutFormData.repair_notes}
                      onChange={(event) =>
                        setCheckoutFormData((current) => ({
                          ...current,
                          repair_notes: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Fehlerbeschreibung, Zubehör, RMA..."
                    />
                  </label>
                </>
              )}

              <button
                className="primary-button full-width-action"
                type="submit"
                disabled={isWorkflowSaving}
              >
                {isWorkflowSaving ? 'Speichert...' : 'Check-Out speichern'}
              </button>
              {workflowError && <div className="modal-error">{workflowError}</div>}
            </form>
          </section>
        </div>
      )}

      {checkinOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal">
            <h2>Check-In bestätigen?</h2>
            <p>
              Sind alle ausgewählten Artikel vollständig, funktionsfähig und wieder
              verfügbar?
            </p>
            {activeCheckinNotes.length > 0 && (
              <div className="repair-notes-box">
                <strong>Gespeicherte Hinweise</strong>
                {activeCheckinNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
            <div className="confirm-actions">
              <button type="button" onClick={() => setCheckinOpen(false)}>
                Abbrechen
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isWorkflowSaving}
                onClick={() => void handleCheckin()}
              >
                {isWorkflowSaving ? 'Speichert...' : 'Ja, Check-In speichern'}
              </button>
            </div>
          </section>
        </div>
      )}

      {customerPromptOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal">
            <h2>Neuen Kunden anlegen?</h2>
            <p>
              Für "{checkoutFormData.borrower}" wurde kein bestehender Kunde
              ausgewählt. Soll dieser Kunde neu angelegt werden?
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setCustomerPromptOpen(false)}>
                Nein
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setCustomerCreateMode('checkout');
                  setCustomerFormData({
                    ...emptyCustomerForm,
                    name: checkoutFormData.borrower.trim(),
                  });
                  setCustomerPromptOpen(false);
                  setCustomerCreateOpen(true);
                }}
              >
                Ja, anlegen
              </button>
            </div>
          </section>
        </div>
      )}

      {extendOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal workflow-modal">
            <div className="form-header">
              <div>
                <h2>Verleih verlängern</h2>
                <p className="modal-subline">
                  {selectedIds.length}{' '}
                  {selectedIds.length === 1 ? 'Artikel ausgewählt' : 'Artikel ausgewählt'}
                </p>
              </div>
              <button type="button" onClick={() => setExtendOpen(false)}>
                Schließen
              </button>
            </div>

            <form className="workflow-form" onSubmit={handleExtendLoan}>
              <label>
                Neues Rückgabedatum *
                <input
                  type="date"
                  value={extendedReturnDate}
                  onChange={(event) => setExtendedReturnDate(event.target.value)}
                  required
                />
              </label>
              <button
                className="primary-button full-width-action"
                type="submit"
                disabled={isWorkflowSaving}
              >
                {isWorkflowSaving ? 'Speichert...' : 'Verlängerung speichern'}
              </button>
              {workflowError && <div className="modal-error">{workflowError}</div>}
            </form>
          </section>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal">
            <h2>Artikel löschen?</h2>
            <p>
              Du löschst {selectedIds.length}{' '}
              {selectedIds.length === 1 ? 'ausgewählten Artikel' : 'ausgewählte Artikel'}.
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setDeleteConfirmOpen(false)}>
                Abbrechen
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeleteSelected()}
              >
                {isDeleting ? 'Löscht...' : 'Löschen'}
              </button>
            </div>
          </section>
        </div>
      )}

      {warningMessage && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal">
            <h2>Achtung</h2>
            <p>{warningMessage}</p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setWarningMessage('')}>
                Verstanden
              </button>
            </div>
          </section>
        </div>
      )}
        </>
      )}

      {customerCreateOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="edit-modal customer-modal">
            <div className="form-header">
              <div>
                <h2>Kunde anlegen</h2>
                {customerCreateMode === 'checkout' && (
                  <p className="modal-subline">
                    Der Check-Out wird danach automatisch gespeichert.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomerCreateOpen(false);
                  setWorkflowError('');
                }}
              >
                Schließen
              </button>
            </div>

            <CustomerForm
              data={customerFormData}
              isSaving={isCustomerSaving}
              submitLabel={
                isCustomerSaving
                  ? 'Speichert...'
                  : customerCreateMode === 'checkout'
                    ? 'Kunde anlegen und Check-Out speichern'
                    : 'Kunde anlegen'
              }
              onSubmit={handleCreateCustomer}
              onChange={setCustomerFormData}
              error={workflowError}
            />
          </section>
        </div>
      )}

      {customerInfo && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="confirm-modal workflow-modal">
            <div className="form-header">
              <div>
                <h2>Kundeninfo</h2>
                <p className="modal-subline">{getCustomerDisplayName(customerInfo)}</p>
              </div>
              <button type="button" onClick={() => setCustomerInfo(null)}>
                Schließen
              </button>
            </div>

            <div className="info-list">
              <InfoRow label="Typ" value={customerInfo.customer_type} />
              <InfoRow label="Name / Firma" value={customerInfo.name} />
              {customerInfo.customer_type === 'Firma' && (
                <InfoRow label="Ansprechperson" value={customerInfo.contact_person} />
              )}
              <InfoRow label="E-Mail" value={customerInfo.email} />
              <InfoRow label="Telefon" value={customerInfo.phone} />
              <InfoRow label="Notizen" value={customerInfo.notes} />
            </div>
          </section>
        </div>
      )}

      {customerEdit && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="edit-modal customer-modal">
            <div className="form-header">
              <div>
                <h2>Kunde bearbeiten</h2>
                <p className="modal-subline">{getCustomerDisplayName(customerEdit)}</p>
              </div>
              <button type="button" onClick={() => setCustomerEdit(null)}>
                Schließen
              </button>
            </div>

            <CustomerForm
              data={customerEditFormData}
              isSaving={isUpdating}
              submitLabel={isUpdating ? 'Speichert...' : 'Kunde speichern'}
              onSubmit={handleUpdateCustomer}
              onChange={setCustomerEditFormData}
              error={error}
            />
          </section>
        </div>
      )}

      {customerLoans && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="edit-modal">
            <div className="form-header">
              <div>
                <h2>Aktuelle Leihen</h2>
                <p className="modal-subline">{getCustomerDisplayName(customerLoans)}</p>
              </div>
              <button type="button" onClick={() => setCustomerLoans(null)}>
                Schließen
              </button>
            </div>

            {selectedCustomerLoanRows.length === 0 ? (
              <p className="empty-state">Keine aktiven Leihen.</p>
            ) : (
              <div className="table-wrap modal-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Artikel</th>
                      <th>Verleihbeginn</th>
                      <th>Rückgabedatum</th>
                      <th>Kaufpreis</th>
                      <th>Notizen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomerLoanRows.map(({ log, item }) => (
                      <tr key={log.id}>
                        <td className="name-cell">{item?.name ?? log.equipment_name}</td>
                        <td>{formatDate(log.borrowed_at)}</td>
                        <td>{formatDate(log.return_date)}</td>
                        <td>
                          {item?.purchase_price
                            ? currencyFormatter.format(item.purchase_price)
                            : '-'}
                        </td>
                        <td>{log.loan_notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {activePage === 'customers' && (
        <section className="inventory-panel">
          <div className="panel-header">
            <h1>Kunden</h1>
            <div className="panel-filters is-placeholder" aria-hidden="true" />
            <span>
              Zeige {customerRows.length} von {customers.length} Kunden
            </span>
          </div>

          {customers.length === 0 ? (
            <p className="empty-state">Noch keine Kunden angelegt.</p>
          ) : customerRows.length === 0 ? (
            <p className="empty-state">Keine Kunden gefunden.</p>
          ) : (
            <div className="table-wrap responsive-table">
              <table>
                <thead>
                  <tr>
                    <SortableTh
                      label="Name / Firma"
                      sortKeyValue="customer_name"
                      activeKey={customerSortKey}
                      direction={customerSortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableTh
                      label="Typ"
                      sortKeyValue="customer_type"
                      activeKey={customerSortKey}
                      direction={customerSortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableTh
                      label="Ansprechperson"
                      sortKeyValue="contact_person"
                      activeKey={customerSortKey}
                      direction={customerSortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableTh
                      label="Aktive Leihen"
                      sortKeyValue="active_loan_count"
                      activeKey={customerSortKey}
                      direction={customerSortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableTh
                      label="Aktives Ausleihevolumen"
                      sortKeyValue="active_loan_value"
                      activeKey={customerSortKey}
                      direction={customerSortDirection}
                      onSort={changeCustomerSort}
                    />
                    <SortableTh
                      label="Letzte Ausleihe"
                      sortKeyValue="latest_loan"
                      activeKey={customerSortKey}
                      direction={customerSortDirection}
                      onSort={changeCustomerSort}
                    />
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {customerRows.map((row) => (
                    <tr key={row.customer.id}>
                      <td className="name-cell" data-label="Name / Firma">{row.customer.name}</td>
                      <td data-label="Typ">{row.customer.customer_type}</td>
                      <td data-label="Ansprechperson">{row.customer.contact_person || '-'}</td>
                      <td data-label="Aktive Leihen">{row.activeLoanCount}</td>
                      <td data-label="Ausleihevolumen">{currencyFormatter.format(row.activeLoanValue)}</td>
                      <td data-label="Letzte Ausleihe">{formatDate(row.latestLoan)}</td>
                      <td data-label="Aktionen">
                        <div className="row-actions">
                          <button
                            className="table-icon-button"
                            type="button"
                            onClick={() => setCustomerInfo(row.customer)}
                            aria-label={`${row.customer.name} Informationen anzeigen`}
                          >
                            <InfoIcon />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            onClick={() => openCustomerEdit(row.customer)}
                            aria-label={`${row.customer.name} bearbeiten`}
                          >
                            <AdjustIcon />
                          </button>
                          <button
                            className="table-icon-button"
                            type="button"
                            onClick={() => setCustomerLoans(row.customer)}
                            aria-label={`${row.customer.name} aktive Leihen anzeigen`}
                          >
                            <LoansIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activePage === 'protocol' && (
        <section className="inventory-panel">
          <div className="panel-header">
            <h1>Protokoll</h1>
            <div className="panel-filters protocol-filters">
              <select
                value={protocolFilter}
                onChange={(event) => {
                  setProtocolFilter(event.target.value as ProtocolFilter);
                  setProtocolPage(1);
                }}
              >
                <option value="all">Alle Vorgänge</option>
                <option value="Verleih">Verleih</option>
                <option value="Verlängerung">Verlängerung</option>
                <option value="Reparatur">Reparatur</option>
                <option value="Check-In">Check-In</option>
              </select>
            </div>
            <span>
              Zeige {protocolStart} bis {protocolEnd} von{' '}
              {filteredProtocolRows.length} Vorgängen
            </span>
          </div>

          {filteredProtocolRows.length === 0 ? (
            <p className="empty-state">Noch keine Vorgänge dokumentiert.</p>
          ) : (
            <>
              <div className="protocol-list">
                {visibleProtocolRows.map((row) => (
                  <article className="protocol-entry" key={row.id}>
                    <div>
                      <span className={`protocol-tag ${protocolClassName(row.kind)}`}>
                        {row.kind}
                      </span>
                    </div>

                    <div className="protocol-main">
                      <div className="protocol-title-row">
                        <div className="protocol-title-group">
                          <h2>{row.equipmentName}</h2>
                          <div className="protocol-meta">
                            {row.customerName && (
                              <span>
                                {row.kind === 'Check-In' ? 'Von' : 'An'}:{' '}
                                {row.customerName}
                              </span>
                            )}
                            {row.kind === 'Reparatur' && row.primaryDate && (
                              <span>Versand: {formatDate(row.primaryDate)}</span>
                            )}
                            {row.kind === 'Verleih' && (
                              <>
                                <span>Start: {formatDate(row.primaryDate)}</span>
                                <span>Rückgabe: {formatDate(row.secondaryDate)}</span>
                              </>
                            )}
                            {row.kind === 'Verlängerung' && (
                              <span>Neue Rückgabe: {formatDate(row.secondaryDate)}</span>
                            )}
                            {row.kind === 'Check-In' && row.primaryDate && (
                              <span>Check-In: {formatDateTime(row.primaryDate)}</span>
                            )}
                            {row.kind !== 'Verlängerung' && row.value !== null && (
                              <span>{currencyFormatter.format(row.value)}</span>
                            )}
                          </div>
                        </div>
                        <time>{formatDateTime(row.date)}</time>
                      </div>

                      {row.notes && (
                        <p className="protocol-notes">{row.notes}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="protocol-pagination">
                <div className="pagination-buttons">
                  <button
                    type="button"
                    disabled={protocolPage === 1}
                    onClick={() => setProtocolPage((current) => Math.max(1, current - 1))}
                  >
                    Zurück
                  </button>
                  <span>
                    Seite {protocolPage} von {protocolPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={protocolPage === protocolPageCount}
                    onClick={() =>
                      setProtocolPage((current) =>
                        Math.min(protocolPageCount, current + 1),
                      )
                    }
                  >
                    Weiter
                  </button>
                </div>

                <label>
                  Einträge pro Seite
                  <select
                    value={protocolPageSize}
                    onChange={(event) => {
                      setProtocolPageSize(Number(event.target.value));
                      setProtocolPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function StatusLine({
  status,
  count,
}: {
  status: EquipmentStatus;
  count: number;
}) {
  return (
    <div className="status-line">
      <span className={`status-dot ${statusClassName(status)}`} />
      <span>{status}</span>
      <strong>{count}</strong>
    </div>
  );
}

function SortableTh<TSortKey extends TableSortKey>({
  label,
  sortKeyValue,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKeyValue: TSortKey;
  activeKey: TSortKey | null;
  direction: SortDirection;
  onSort: (sortKey: TSortKey) => void;
}) {
  const isActive = activeKey === sortKeyValue;

  return (
    <th>
      <button
        className={`sort-button ${isActive ? 'active' : ''}`}
        type="button"
        onClick={() => onSort(sortKeyValue)}
      >
        <span>{label}</span>
        <span aria-hidden="true">{isActive ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function EquipmentForm({
  data,
  isSaving,
  submitLabel,
  onSubmit,
  onChange,
  onScanEan,
  showStatusField = false,
}: {
  data: EquipmentFormData;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onChange: <K extends keyof EquipmentFormData>(
    key: K,
    value: EquipmentFormData[K],
  ) => void;
  onScanEan?: () => void;
  showStatusField?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="equipment-form">
      <label>
        Name *
        <input
          value={data.name}
          onChange={(event) => onChange('name', event.target.value)}
          placeholder="Sony FX6 Set"
          required
        />
      </label>

      <label>
        Marke
        <input
          value={data.brand ?? ''}
          onChange={(event) => onChange('brand', event.target.value)}
          placeholder="Sony"
        />
      </label>

      <label>
        Modell
        <input
          value={data.model ?? ''}
          onChange={(event) => onChange('model', event.target.value)}
          placeholder="FX6"
        />
      </label>

      <label>
        Seriennummer
        <input
          value={data.serial_number ?? ''}
          onChange={(event) => onChange('serial_number', event.target.value)}
          placeholder="SN-123456"
        />
      </label>

      <label>
        EAN Code
        {onScanEan ? (
          <div className="inline-control">
            <input
              value={data.ean_code ?? ''}
              onChange={(event) => onChange('ean_code', event.target.value)}
              placeholder="EAN"
            />
            <button type="button" onClick={onScanEan}>
              Scan
            </button>
          </div>
        ) : (
          <input
            value={data.ean_code ?? ''}
            onChange={(event) => onChange('ean_code', event.target.value)}
            placeholder="EAN"
          />
        )}
      </label>

      <label>
        Kategorie
        <select
          value={data.category}
          onChange={(event) =>
            onChange('category', event.target.value as EquipmentFormData['category'])
          }
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label>
        Kaufdatum
        <input
          type="date"
          value={data.purchase_date ?? ''}
          onChange={(event) => onChange('purchase_date', event.target.value)}
        />
      </label>

      <label>
        Kaufpreis
        <input
          type="number"
          min="0"
          step="0.01"
          value={data.purchase_price ?? ''}
          onChange={(event) =>
            onChange(
              'purchase_price',
              event.target.value ? Number(event.target.value) : null,
            )
          }
          placeholder="2500"
        />
      </label>

      {showStatusField && (
        <label>
          Status
          <select
            value={data.status}
            onChange={(event) =>
              onChange('status', event.target.value as EquipmentStatus)
            }
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="notes-field">
        Notizen
        <textarea
          value={data.notes ?? ''}
          onChange={(event) => onChange('notes', event.target.value)}
          rows={4}
          placeholder="Zubehör, Zustand, Besonderheiten..."
        />
      </label>

      <button className="primary-button" type="submit" disabled={isSaving}>
        {submitLabel}
      </button>
    </form>
  );
}

function CustomerForm({
  data,
  isSaving,
  submitLabel,
  onSubmit,
  onChange,
  error,
}: {
  data: CustomerFormData;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onChange: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  error?: string;
}) {
  return (
    <form className="customer-form" onSubmit={onSubmit}>
      <div className="customer-form-row customer-profile-row-simple">
        <label>
          Typ
          <select
            value={data.customer_type}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                customer_type: event.target.value as CustomerFormData['customer_type'],
              }))
            }
          >
            <option value="Selbständig/Freiberuflich">Selbständig/Freiberuflich</option>
            <option value="Privatperson">Privatperson</option>
            <option value="Firma">Firma</option>
          </select>
        </label>

        <label>
          {data.customer_type === 'Firma' ? 'Firmenname' : 'Name'} *
          <input
            value={data.name}
            onChange={(event) =>
              onChange((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
        </label>
      </div>

      {data.customer_type === 'Firma' && (
        <label>
          Ansprechperson
          <input
            value={data.contact_person}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                contact_person: event.target.value,
              }))
            }
          />
        </label>
      )}

      <div className="customer-form-row">
        <label>
          E-Mail
          <input
            type="email"
            value={data.email}
            onChange={(event) =>
              onChange((current) => ({ ...current, email: event.target.value }))
            }
          />
        </label>

        <label>
          Telefon
          <input
            value={data.phone}
            onChange={(event) =>
              onChange((current) => ({ ...current, phone: event.target.value }))
            }
          />
        </label>
      </div>

      <label>
        Notizen
        <textarea
          value={data.notes}
          onChange={(event) =>
            onChange((current) => ({ ...current, notes: event.target.value }))
          }
          rows={4}
        />
      </label>

      <button
        className="primary-button full-width-action"
        type="submit"
        disabled={isSaving}
      >
        {submitLabel}
      </button>
      {error && <div className="modal-error">{error}</div>}
    </form>
  );
}

function AdjustIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 8h11v11H8z" />
      <path d="M5 16H4V4h12v1" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 17v-6" />
      <path d="M12 7h.01" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function LoansIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function sanitizeEquipmentPayload(data: EquipmentFormData) {
  return {
    ...data,
    purchase_price: data.purchase_price ?? null,
    borrower: data.borrower || null,
    borrowed_at: data.borrowed_at || null,
    return_date: data.return_date || null,
    purchase_date: data.purchase_date || null,
    brand: data.brand || null,
    model: data.model || null,
    serial_number: data.serial_number || null,
    ean_code: data.ean_code || null,
    notes: data.notes || null,
  };
}

function itemToFormData(item: EquipmentItem): EquipmentFormData {
  return {
    name: item.name,
    brand: item.brand ?? '',
    model: item.model ?? '',
    serial_number: item.serial_number ?? '',
    ean_code: item.ean_code ?? '',
    category: item.category,
    purchase_date: item.purchase_date ?? '',
    purchase_price: item.purchase_price,
    status: item.status,
    borrower: item.borrower ?? '',
    borrowed_at: item.borrowed_at ?? '',
    return_date: item.return_date ?? '',
    notes: item.notes ?? '',
  };
}

function itemToCopyFormData(item: EquipmentItem): EquipmentFormData {
  return {
    name: `${item.name} Kopie`,
    brand: item.brand ?? '',
    model: item.model ?? '',
    serial_number: '',
    ean_code: '',
    category: item.category,
    purchase_date: item.purchase_date ?? '',
    purchase_price: item.purchase_price,
    status: 'verfügbar',
    borrower: '',
    borrowed_at: '',
    return_date: '',
    notes: item.notes ?? '',
  };
}

function customerToFormData(customer: Customer): CustomerFormData {
  return {
    customer_type: customer.customer_type,
    name: customer.name,
    contact_person: customer.contact_person ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    notes: customer.notes ?? '',
  };
}

function isDateBefore(date: string, compareTo: string) {
  const firstDate = new Date(date);
  const secondDate = new Date(compareTo);
  firstDate.setHours(0, 0, 0, 0);
  secondDate.setHours(0, 0, 0, 0);

  return firstDate < secondDate;
}

function isDateAfter(date: string, compareTo: string) {
  const firstDate = new Date(date);
  const secondDate = new Date(compareTo);
  firstDate.setHours(0, 0, 0, 0);
  secondDate.setHours(0, 0, 0, 0);

  return firstDate > secondDate;
}

function isOverdue(item: EquipmentItem) {
  if (item.status !== 'verliehen' || !item.return_date) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const returnDate = new Date(item.return_date);
  returnDate.setHours(0, 0, 0, 0);

  return returnDate < today;
}

function getDeleteBlockedMessage(items: EquipmentItem[]) {
  const loanCount = items.filter((item) => item.status === 'verliehen').length;
  const repairCount = items.filter((item) => item.status === 'in Reparatur').length;

  if (loanCount > 0 && repairCount > 0) {
    return 'Löschen blockiert: In deiner Auswahl sind verliehene Artikel und Artikel in Reparatur. Bitte zuerst getrennt einchecken oder den Status klären.';
  }

  if (loanCount > 0) {
    return 'Löschen blockiert: Mindestens ein ausgewählter Artikel ist verliehen und damit außer Haus.';
  }

  return 'Löschen blockiert: Mindestens ein ausgewählter Artikel ist in Reparatur und damit außer Haus.';
}

function getCurrentLocation(item: EquipmentItem) {
  if (item.status === 'verliehen') {
    return item.borrower || 'Verliehen';
  }

  if (item.status === 'in Reparatur') {
    return 'Reparatur';
  }

  if (item.status === 'ausgemustert') {
    return 'Ausgemustert';
  }

  return 'Lager';
}

function getCustomerDisplayName(customer: Customer) {
  if (customer.customer_type === 'Firma' && customer.contact_person) {
    return `${customer.name} · ${customer.contact_person}`;
  }

  return customer.name;
}

function getCustomerOptionLabel(customer: Customer) {
  if (customer.customer_type === 'Firma' && customer.contact_person) {
    return `${customer.name} · ${customer.contact_person}`;
  }

  return customer.name;
}

function getSearchTerms(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function matchesAllSearchTerms(values: Array<string | null>, searchTerms: string[]) {
  const searchableText = values.filter(Boolean).join(' ').toLowerCase();

  return searchTerms.every((term) => searchableText.includes(term));
}

function isLatestActiveLog(log: CheckoutLog, logs: CheckoutLog[]) {
  if (log.checked_in_at || log.equipment_id === null) {
    return false;
  }

  return !logs.some(
    (otherLog) =>
      otherLog.id !== log.id &&
      otherLog.equipment_id === log.equipment_id &&
      otherLog.action_type === log.action_type &&
      !otherLog.checked_in_at &&
      new Date(otherLog.created_at).getTime() > new Date(log.created_at).getTime(),
  );
}

function isLoanExtension(log: CheckoutLog, logs: CheckoutLog[]) {
  if (log.action_type !== 'Verleih' || log.equipment_id === null) {
    return false;
  }

  return logs.some(
    (otherLog) =>
      otherLog.id !== log.id &&
      otherLog.equipment_id === log.equipment_id &&
      otherLog.action_type === 'Verleih' &&
      otherLog.borrower === log.borrower &&
      otherLog.borrowed_at === log.borrowed_at &&
      new Date(otherLog.created_at).getTime() < new Date(log.created_at).getTime(),
  );
}

function createProtocolRows(
  log: CheckoutLog,
  logs: CheckoutLog[],
  value: number | null,
): ProtocolRow[] {
  const checkoutKind: ProtocolEventKind =
    log.action_type === 'Reparatur'
      ? 'Reparatur'
      : isLoanExtension(log, logs)
        ? 'Verlängerung'
        : 'Verleih';
  const checkoutNotes =
    log.action_type === 'Reparatur' ? log.repair_notes : log.loan_notes;
  const rows: ProtocolRow[] = [
    {
      id: `${log.id}-out`,
      kind: checkoutKind,
      date: log.checked_out_at ?? log.created_at,
      equipmentName: log.equipment_name,
      customerName: log.borrower,
      primaryDate: log.action_type === 'Reparatur' ? log.repair_sent_at : log.borrowed_at,
      secondaryDate: log.return_date,
      notes: checkoutNotes,
      value,
    },
  ];

  if (log.checked_in_at && isFirstCheckinLog(log, logs)) {
    rows.push({
      id: `${log.id}-in`,
      kind: 'Check-In',
      date: log.checked_in_at,
      equipmentName: log.equipment_name,
      customerName: log.borrower,
      primaryDate: log.checked_in_at,
      secondaryDate: null,
      notes:
        log.action_type === 'Reparatur'
          ? log.repair_notes
          : log.loan_notes,
      value,
    });
  }

  return rows;
}

function isFirstCheckinLog(log: CheckoutLog, logs: CheckoutLog[]) {
  if (!log.checked_in_at || log.equipment_id === null) {
    return false;
  }

  return !logs.some(
    (otherLog) =>
      otherLog.id < log.id &&
      otherLog.equipment_id === log.equipment_id &&
      otherLog.checked_in_at === log.checked_in_at,
  );
}

function protocolClassName(kind: ProtocolEventKind) {
  return kind
    .replace('ä', 'ae')
    .replace('-', '')
    .toLowerCase();
}

function compareEquipmentItems(
  first: EquipmentItem,
  second: EquipmentItem,
  sortKey: SortKey,
  direction: SortDirection,
) {
  const modifier = direction === 'asc' ? 1 : -1;

  if (sortKey === 'purchase_price') {
    return ((first.purchase_price ?? 0) - (second.purchase_price ?? 0)) * modifier;
  }

  const firstValue =
    sortKey === 'current_location'
      ? getCurrentLocation(first).toLowerCase()
      : String(first[sortKey] ?? '').toLowerCase();
  const secondValue =
    sortKey === 'current_location'
      ? getCurrentLocation(second).toLowerCase()
      : String(second[sortKey] ?? '').toLowerCase();

  return firstValue.localeCompare(secondValue, 'de') * modifier;
}

function compareCustomerRows(
  first: CustomerRow,
  second: CustomerRow,
  sortKey: CustomerSortKey,
  direction: SortDirection,
) {
  const modifier = direction === 'asc' ? 1 : -1;

  if (sortKey === 'active_loan_count') {
    return (first.activeLoanCount - second.activeLoanCount) * modifier;
  }

  if (sortKey === 'active_loan_value') {
    return (first.activeLoanValue - second.activeLoanValue) * modifier;
  }

  if (sortKey === 'latest_loan') {
    const firstDate = first.latestLoan ? new Date(first.latestLoan).getTime() : 0;
    const secondDate = second.latestLoan ? new Date(second.latestLoan).getTime() : 0;

    return (firstDate - secondDate) * modifier;
  }

  const firstValue = getCustomerSortValue(first, sortKey);
  const secondValue = getCustomerSortValue(second, sortKey);

  return firstValue.localeCompare(secondValue, 'de') * modifier;
}

function getCustomerSortValue(row: CustomerRow, sortKey: CustomerSortKey) {
  if (sortKey === 'customer_type') {
    return row.customer.customer_type.toLowerCase();
  }

  if (sortKey === 'contact_person') {
    return (row.customer.contact_person ?? '').toLowerCase();
  }

  return row.customer.name.toLowerCase();
}

function formatDateTime(date: string | null) {
  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatDate(date: string | null) {
  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('de-DE').format(new Date(date));
}

function statusClassName(status: EquipmentStatus) {
  return status
    .replace('ü', 'ue')
    .replace(' ', '-')
    .toLowerCase();
}

function getScannerErrorMessage(scanError: unknown) {
  const message = String(scanError);

  if (message.includes('NotAllowedError') || message.includes('Permission denied')) {
    return 'Kamera-Zugriff wurde blockiert. Bitte erlaube die Kamera im Browser, lade die Seite neu und klicke erneut auf Scan.';
  }

  if (message.includes('NotFoundError') || message.includes('Requested device not found')) {
    return 'Keine Kamera gefunden. Bitte prüfe, ob eine Kamera verbunden und nicht von einer anderen App blockiert ist.';
  }

  return `Scanner konnte nicht gestartet werden: ${message}`;
}

function normalizeScannedCode(decodedText: string) {
  const trimmedCode = decodedText.trim();
  const eightDigitCode = trimmedCode.match(/(?:^|\D)(\d{8})(?:\D|$)/);

  return eightDigitCode?.[1] ?? trimmedCode;
}

export default App;
