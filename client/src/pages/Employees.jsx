import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    AlertCircle,
    BriefcaseBusiness,
    Camera,
    Download,
    FileText,
    Landmark,
    Pencil,
    Plus,
    Search,
    Trash2,
    Upload,
    UserRound,
    X
} from 'lucide-react';
import { useWorkforce, DAYSHORT, API_BASE } from '../context/workforceShared';

const EMPTY_FORM = {
    id: '',
    name: '',
    email: '',
    phone: '',
    dob: '',
    address: '',
    aadhaarNumber: '',
    bankName: '',
    bankAccount: '',
    bankIfsc: '',
    role: '',
    dept: '',
    employmentType: 'Full-time',
    joinDate: '',
    salary: '',
    checkin: '',
    weekoffs: []
};

const DOCUMENT_TYPES = [
    { type: 'aadhaar', label: 'Aadhaar Card', required: true },
    { type: 'bank', label: 'Bank Proof', required: true },
    { type: 'voterId', label: 'Voter ID', required: true },
    { type: 'drivingLicence', label: 'Driving Licence', required: false }
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const formatFileSize = (bytes = 0) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCurrency = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount)
        ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
        : '—';
};

const inferMimeType = (file) => {
    if (file.type) return file.type;
    const extension = file.name.split('.').pop()?.toLowerCase();
    return ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[extension] || '';
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
});

const FormField = ({ label, required, error, children }) => (
    <div className="space-y-1">
        <label className="ed-field-label">
            {label} {required && <span className="ed-required-mark">*</span>}
        </label>

        {React.cloneElement(children, {
            className: `${children.props.className || ''} ${error ? 'ed-field-has-error' : ''}`
        })}

        {error && (
            <p className="ed-field-error">
                {error}
            </p>
        )}
    </div>
);

const DetailItem = ({ label, value, wide = false }) => (
    <div className={`ed-detail-item ${wide ? 'wide' : ''}`}>
        <span>{label}</span>
        <strong>{value || '—'}</strong>
    </div>
);

const DocumentCard = ({
    item,
    asset,
    pendingFile,
    inputId,
    busy,
    error,
    onPick,
    onDownload,
    onRemove,
    allowUpload = false,
    showRequiredMark = false
}) => {
    const file = pendingFile || asset;
    const hasFile = Boolean(file);

    return (
        <div
            tabIndex={error ? 0 : -1}
            data-field={item.type}
            className={`ed-document-card ${hasFile ? 'is-ready' : 'is-missing'} ${error ? 'has-error' : ''}`}
        >
            <div className="ed-document-icon"><FileText size={22} /></div>
            <div className="ed-document-copy">
                <div className="ed-document-title-row">
    <strong>
        {item.label}
        {showRequiredMark && item.required && <em>*</em>}
    </strong>
</div>
                {hasFile ? (
                    <p title={file.name || file.fileName}>
                        {file.name || file.fileName} <span>· {formatFileSize(file.size)}</span>
                    </p>
                ) : (
                    <p>{showRequiredMark && item.required ? 'Required document is missing' : 'No document added'}</p>
                )}
                {error && <small className="ed-field-error">{error}</small>}
            </div>
            <div className="ed-document-actions">
                {asset && !pendingFile && (
                    <button type="button" className="ed-icon-action" onClick={() => onDownload(item.type)} title={`Download ${item.label}`} disabled={busy}>
                        <Download size={17} />
                    </button>
                )}
                {allowUpload && (
    <>
        <input
            id={inputId}
            className="ed-hidden-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => {
                const fileValue = event.target.files?.[0];
                if (fileValue) onPick(item.type, fileValue);
                event.target.value = '';
            }}
            disabled={busy}
        />

        <label className="ed-upload-action" htmlFor={inputId} aria-disabled={busy}>
            <Upload size={16} />
            {busy ? 'Uploading…' : hasFile ? 'Change' : 'Upload'}
        </label>

        {hasFile && (
            <button
                type="button"
                className="ed-remove-action"
                onClick={() => onRemove(item.type)}
                disabled={busy}
                title={`Remove ${item.label}`}
            >
                <Trash2 size={16} />
                Remove
            </button>
        )}
    </>
)}
            </div>
        </div>
    );
};

const Employees = () => {
    const { employees, saveEmployees } = useWorkforce();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEmployeeId, setEditingEmployeeId] = useState(null);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [biometricIds, setBiometricIds] = useState([]);
    const [fetchingBioIds, setFetchingBioIds] = useState(false);
    const [showBioDropdown, setShowBioDropdown] = useState(false);
    const [assetMeta, setAssetMeta] = useState({});
    const [assetLoading, setAssetLoading] = useState(false);
    const [assetError, setAssetError] = useState('');
    const [assetVersion, setAssetVersion] = useState(0);
    const [uploadingType, setUploadingType] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [pendingAssets, setPendingAssets] = useState({});
    const [pendingPhotoUrl, setPendingPhotoUrl] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [removeDocument, setRemoveDocument] = useState(null);

    const selectedEmployee = employees.find(employee => employee.id === selectedEmployeeId);

    const filteredEmployees = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return employees;
        return employees.filter(employee => [employee.name, employee.id, employee.dept, employee.role]
            .some(value => String(value || '').toLowerCase().includes(query)));
    }, [employees, searchTerm]);

    useEffect(() => {
        if (selectedEmployeeId && !employees.some(employee => employee.id === selectedEmployeeId)) {
            setSelectedEmployeeId('');
            setIsFormOpen(false);
        }
    }, [employees, selectedEmployeeId]);

    useEffect(() => {
        let isActive = true;
        let objectUrl = '';

        setAssetMeta({});
        setPhotoUrl('');
        setAssetError('');

        if (!selectedEmployeeId) {
            setAssetLoading(false);
            return () => { };
        }

        const loadAssets = async () => {
            setAssetLoading(true);
            try {
                const response = await axios.get(`${API_BASE}/api/employees/${encodeURIComponent(selectedEmployeeId)}/assets`);
                if (!isActive) return;
                const nextMeta = Object.fromEntries(response.data.map(asset => [asset.type, asset]));
                setAssetMeta(nextMeta);

                if (nextMeta.photo) {
                    try {
                        const photoResponse = await axios.get(
                            `${API_BASE}/api/employees/${encodeURIComponent(selectedEmployeeId)}/assets/photo`,
                            { responseType: 'blob' }
                        );
                        if (!isActive) return;
                        objectUrl = URL.createObjectURL(photoResponse.data);
                        setPhotoUrl(objectUrl);
                    } catch (photoError) {
                        if (isActive) console.error('Unable to load employee photo:', photoError);
                    }
                }
            } catch (error) {
                if (isActive) {
                    console.error('Unable to load employee documents:', error);
                    setAssetError(error?.response?.data?.error || 'Documents could not be loaded right now.');
                }
            } finally {
                if (isActive) setAssetLoading(false);
            }
        };

        loadAssets();
        return () => {
            isActive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [selectedEmployeeId, assetVersion]);

    useEffect(() => () => {
        if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
    }, [pendingPhotoUrl]);

    const updateForm = (field, value) => {
        setFormData(previous => ({ ...previous, [field]: value }));
        setFormError('');

        if (fieldErrors[field]) {
            setFieldErrors(previous => {
                const next = { ...previous };
                delete next[field];
                return next;
            });
        }
    };

    const resetPendingAssets = () => {
        setPendingAssets({});
        setPendingPhotoUrl('');
    };
const clearEmployeeSearch = () => {
    setSearchTerm('');
};

const clearEmployeeSelection = () => {
    setSelectedEmployeeId('');
    setSearchTerm('');
    setAssetError('');
    setIsFormOpen(false);
    setEditingEmployeeId(null);
};
const selectEmployee = (employeeId) => {
    setSelectedEmployeeId(employeeId);
    setSearchTerm('');
    setAssetError('');
    setIsFormOpen(false);
    setEditingEmployeeId(null);
};

   const startAddEmployee = () => {

    setEditingEmployeeId(null);
    setSelectedEmployeeId('');
    setFormData({
        ...EMPTY_FORM,
        id: '',
        weekoffs: []
    });
    setFormError('');
    setAssetError('');
    setFieldErrors({});
    setAssetMeta({});
    setPhotoUrl('');
    setShowBioDropdown(false);
    resetPendingAssets();
    setIsFormOpen(true);
};

    const startEditEmployee = () => {
        if (!selectedEmployee) return;
        setEditingEmployeeId(selectedEmployee.id);
        setFormData({
            ...EMPTY_FORM,
            ...selectedEmployee,
            salary: selectedEmployee.salary ?? '',
            checkin: selectedEmployee.checkin || '',
            employmentType: selectedEmployee.employmentType || 'Full-time',
            weekoffs: selectedEmployee.weekoffs || []
        });
        setFormError('');
        setAssetError('');
        setFieldErrors({});
        setShowBioDropdown(false);
        resetPendingAssets();
        setIsFormOpen(true);

    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingEmployeeId(null);
        setFormError('');
        setShowBioDropdown(false);
        resetPendingAssets();
        setFieldErrors({});
    };

    const toggleWeekoff = (dayIndex) => {
        setFormData(previous => ({
            ...previous,
            weekoffs: previous.weekoffs.includes(dayIndex)
                ? previous.weekoffs.filter(day => day !== dayIndex)
                : [...previous.weekoffs, dayIndex]
        }));
    };

    const fetchBiometricIds = async () => {
        try {
            setFetchingBioIds(true);
            const response = await axios.get(`${API_BASE}/api/employees/biometric-ids`);
            setBiometricIds(response.data);
            setShowBioDropdown(true);
        } catch (error) {
            console.error('Failed to fetch biometric IDs:', error);
            setFormError('Biometric IDs could not be loaded. Please check the server connection.');
        } finally {
            setFetchingBioIds(false);
        }
    };

    const validateFile = (type, file, setError = setFormError) => {
        const mimeType = inferMimeType(file);
        const allowedTypes = type === 'photo'
            ? ['image/jpeg', 'image/png', 'image/webp']
            : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

        if (!allowedTypes.includes(mimeType)) {
            setError(type === 'photo' ? 'Photo must be a JPG, PNG or WEBP image.' : 'Documents must be PDF, JPG, PNG or WEBP files.');
            return false;
        }
        if (file.size > MAX_FILE_SIZE) {
            setError('Each file must be smaller than 5 MB.');
            return false;
        }
        setError('');
        return true;
    };

    const uploadAsset = async (employeeId, type, file) => {
        const data = await fileToBase64(file);
        await axios.put(`${API_BASE}/api/employees/${encodeURIComponent(employeeId)}/assets/${type}`, {
            fileName: file.name,
            mimeType: inferMimeType(file),
            data
        });
    };

    const handleDirectAssetUpload = async (type, file, isValidated = false) => {
        if (!selectedEmployeeId || (!isValidated && !validateFile(type, file, setAssetError))) return;
        try {
            setAssetError('');
            setUploadingType(type);
            await uploadAsset(selectedEmployeeId, type, file);
            setAssetVersion(version => version + 1);
        } catch (error) {
            console.error('Employee document upload failed:', error);
            setAssetError(error?.response?.data?.error || 'The file could not be uploaded. Please try again.');
        } finally {
            setUploadingType('');
        }
    };

    const handleFormAssetPick = async (type, file) => {
        if (!validateFile(type, file, setFormError)) return;
        if (editingEmployeeId) {
            await handleDirectAssetUpload(type, file, true);
            return;
        }

        setPendingAssets(previous => ({ ...previous, [type]: file }));

        setFieldErrors(previous => {
            const next = { ...previous };
            delete next[type];
            return next;
        });

        if (type === 'photo') setPendingPhotoUrl(URL.createObjectURL(file));
    };

    const handleDownload = async (type) => {
        if (!selectedEmployeeId || !assetMeta[type]) return;
        try {
            const response = await axios.get(
                `${API_BASE}/api/employees/${encodeURIComponent(selectedEmployeeId)}/assets/${type}`,
                { responseType: 'blob' }
            );
            const downloadUrl = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = assetMeta[type].fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            // Some browsers start reading the blob after the click handler returns.
            // Keep it alive briefly so cross-device/mobile downloads do not fail.
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
        } catch (error) {
            console.error('Employee document download failed:', error);
            setAssetError('The document could not be downloaded. Please try again.');
        }
    };
const handleRemoveAsset = async (type) => {
    if (!window.confirm(`Remove ${type === 'photo' ? 'Profile Photo' : DOCUMENT_TYPES.find(item => item.type === type)?.label}?`)) return;

    if (pendingAssets[type]) {
        setPendingAssets(previous => {
            const next = { ...previous };
            delete next[type];
            return next;
        });

        setFieldErrors(previous => {
            const next = { ...previous };
            delete next[type];
            return next;
        });

        if (type === 'photo') {
            setPendingPhotoUrl('');
        }

        return;
    }

    if (!selectedEmployeeId || !assetMeta[type]) return;

    try {
        setAssetError('');
        setUploadingType(type);

        await axios.delete(
            `${API_BASE}/api/employees/${encodeURIComponent(selectedEmployeeId)}/assets/${type}`
        );

        setAssetVersion(version => version + 1);
        
        if (type === 'photo') {
            setPhotoUrl('');
        }
    } catch (error) {
        console.error('Employee document removal failed:', error);
        setAssetError(error?.response?.data?.error || 'The document could not be removed.');
    } finally {
        setUploadingType('');
    }
};

    const focusField = (field) => {
        requestAnimationFrame(() => {
            document.querySelector(`[data-field="${field}"]`)?.focus();
        });
    };

    const handleSave = async () => {
        setAssetError('');
        const errors = {};

        if (!formData.name.trim()) {
            errors.name = 'Full name is required.';
        }

        if (formData.salary === '' || formData.salary === null) {
            errors.salary = 'Basic salary is required.';
        }
        if (!formData.id || !formData.id.trim()) {
            errors.id = 'Employee ID is required.';
        }
        if (!formData.checkin) {
    errors.checkin = 'Standard check-in time is required.';
}

        if (editingEmployeeId) { 
            DOCUMENT_TYPES.forEach(documentType => {
                if (
                    documentType.required &&
                    !pendingAssets[documentType.type] &&
                    !assetMeta[documentType.type]
                ) {
                    errors[documentType.type] = `${documentType.label} is required.`;
                }
            });
        }

        if (Object.keys(errors).length) {
            setFieldErrors(errors);

            if (errors.name) {
                focusField('name');
            } else if (errors.salary) {
                focusField('salary');
            } else {
                const missingDocument = DOCUMENT_TYPES.find(
                    documentType => errors[documentType.type]
                );

                if (missingDocument) {
                    focusField(missingDocument.type);
                }
            }

            return;
        }

        setFieldErrors({});

        const employeeId = editingEmployeeId || formData.id.trim();
        if (!editingEmployeeId && employees.some(employee => employee.id === employeeId)) {
            setFormError('That employee ID already exists.');
            return;
        }



        const employeeRecord = {
            ...formData,
            id: employeeId,
            name: formData.name.trim(),
            salary: Number(formData.salary),
            weekoffs: [...formData.weekoffs]
        };
        delete employeeRecord._id;
        delete employeeRecord.__v;

        const nextEmployees = editingEmployeeId
            ? employees.map(employee => employee.id === editingEmployeeId ? { ...employee, ...employeeRecord, id: editingEmployeeId } : employee)
            : [...employees, employeeRecord];

        try {
            setSaving(true);
            await saveEmployees(nextEmployees);

            const filesToUpload = Object.entries(pendingAssets);
            if (filesToUpload.length) {
                try {
                    await Promise.all(filesToUpload.map(([type, file]) => uploadAsset(employeeId, type, file)));
                } catch (uploadError) {
                    console.error('Employee saved, but one or more files failed to upload:', uploadError);
                    setAssetError('The employee was saved, but one or more files could not be uploaded. You can upload them again below.');
                }
            }

            setSelectedEmployeeId(employeeId);
            setAssetVersion(version => version + 1);
            closeForm();
        } catch (error) {
            console.error('Save employee failed:', error);
            setFormError(error?.response?.data?.error || 'Unable to save this employee. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedEmployee || !window.confirm(`Delete ${selectedEmployee.name}? Attendance records will not be changed.`)) return;
        try {
            setSaving(true);
            await saveEmployees(employees.filter(employee => employee.id !== selectedEmployee.id));
            setSelectedEmployeeId('');
            setIsFormOpen(false);
        } catch (error) {
            console.error('Delete employee failed:', error);
            setAssetError(error?.response?.data?.error || 'Unable to delete this employee.');
        } finally {
            setSaving(false);
        }
    };

    const renderPhoto = (className = '') => {
        const source = pendingPhotoUrl || photoUrl;
        if (source) return <img className={className} src={source} alt={`${formData.name || selectedEmployee?.name || 'Employee'} profile`} />;
        return <div className={`${className} ed-photo-placeholder`}><UserRound size={38} /></div>;
    };

    const renderDocumentCards = (mode) => {
        const allowUpload = mode === 'new' || mode === 'edit';

        return (
            <div className="ed-documents-grid">
                {DOCUMENT_TYPES.map(item => (
                    <DocumentCard
                        key={item.type}
                        item={item}
                        asset={mode === 'new' ? null : assetMeta[item.type]}
                        pendingFile={pendingAssets[item.type]}
                        inputId={`employee-${mode}-${item.type}`}
                        busy={uploadingType === item.type || saving}
                        error={fieldErrors[item.type]}
                        allowUpload={allowUpload}
                        showRequiredMark={mode === 'edit'}
                        onPick={mode === 'new' ? handleFormAssetPick : handleDirectAssetUpload}
                        onDownload={handleDownload}
                        onRemove={handleRemoveAsset}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className="pg active employee-details-page">
            <div className="card employee-selector-card">
                <div className="ed-selector-heading">
                    <div>
                        <span className="ed-eyebrow">Employee records</span>
                        <h2>Find an employee</h2>
                        <p>Search the team, then select a profile to view the complete record.</p>
                    </div>
                    <button type="button" className="primary-btn ed-add-employee" onClick={startAddEmployee}>
                        <Plus size={18} /> Add Employee
                    </button>
                </div>
                <div className="ed-selector-controls">
    <div className="ed-search-wrapper">
        <label className="ed-search-box">
            <Search size={18} />
            <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, ID, department or role"
            />

            {searchTerm && (
                <button
                    type="button"
                    className="ed-clear-search"
                    onClick={clearEmployeeSearch}
                    title="Clear search"
                >
                    <X size={16} />
                </button>
            )}
        </label>

        {searchTerm.trim() && (
            <div className="ed-search-results">
                {filteredEmployees.length ? (
                    filteredEmployees.map(employee => (
                        <button
                            key={employee.id}
                            type="button"
                            className={`ed-search-result ${
                                selectedEmployeeId === employee.id ? 'selected' : ''
                            }`}
                            onClick={() => selectEmployee(employee.id)}
                        >
                            <div className="ed-search-result-avatar">
                                <UserRound size={17} />
                            </div>

                            <div className="ed-search-result-info">
                                <strong>{employee.name}</strong>
                                <span>
                                    {employee.id}
                                    {employee.dept ? ` · ${employee.dept}` : ''}
                                    {employee.role ? ` · ${employee.role}` : ''}
                                </span>
                            </div>
                        </button>
                    ))
                ) : (
                    <div className="ed-search-no-results">
                        <Search size={17} />
                        <span>No employees found</span>
                    </div>
                )}
            </div>
        )}
    </div>

    <div className="ed-employee-select-row">
        <label className="ed-employee-select">
            <span>Employee list</span>

            <select
                value={
                    employees.some(employee => employee.id === selectedEmployeeId)
                        ? selectedEmployeeId
                        : ''
                }
                onChange={(event) => {
                    selectEmployee(event.target.value);
                }}
            >
                <option value="">Select an employee</option>

                {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                        {employee.name} · {employee.id}
                    </option>
                ))}
            </select>
        </label>

        <button
            type="button"
            className="ed-clear-selection"
            onClick={clearEmployeeSelection}
            disabled={!selectedEmployeeId && !searchTerm}
            title="Clear employee selection"
        >
            <X size={16} />
            Clear
        </button>
    </div>

    <span className="ed-result-count">
        {filteredEmployees.length} of {employees.length} employees
    </span>
</div>
            </div>

            {isFormOpen ? (
                <div className="employee-document ed-edit-document">
                    <header className="ed-document-header">
                        <div>
                            <span className="ed-document-kicker">Employee record</span>
                            <h1>{editingEmployeeId ? 'Edit employee details' : 'Create employee profile'}</h1>
                            <p>{editingEmployeeId ? `Update ${formData.name}'s information and files.` : 'Complete the details below to add a new team member.'}</p>
                        </div>
                        <div className="ed-header-actions">
                            <button type="button" className="ed-secondary-action" onClick={closeForm} disabled={saving}><X size={17} /> Cancel</button>
                            <button type="button" className="ed-primary-action" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save employee'}</button>
                        </div>
                    </header>

                    {formError && <div className="ed-alert"><AlertCircle size={18} /> {formError}</div>}

                    <section className="ed-document-section">
                        <div className="ed-section-title"><UserRound size={19} /><div><h3>Personal details</h3><p>Identity and contact information</p></div></div>
                        <div className="ed-personal-layout">
<div className="ed-photo-editor">
    <div className="ed-photo-wrapper" style={{ position: 'relative' }}>
        {renderPhoto('ed-profile-photo')}
        
        {(photoUrl || pendingPhotoUrl) && (
            <button
                type="button"
                className="ed-remove-photo-btn"
                onClick={() => handleRemoveAsset('photo')}
                title="Remove photo"
            >
                <X size={12} strokeWidth={3} />
            </button>
        )}
    </div>

    <input
        id="employee-form-photo"
        className="ed-hidden-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFormAssetPick('photo', file);
            event.target.value = '';
        }}
    />
    <label htmlFor="employee-form-photo" className="ed-photo-button">
        <Camera size={16} /> {photoUrl || pendingPhotoUrl ? 'Change photo' : 'Add photo'}
    </label>
    <small>JPG, PNG or WEBP · Max 5 MB</small>
</div>

                            <div className="ed-form-grid">
                                <FormField label="Full name" required error={fieldErrors.name} field="name"><input data-field="name" value={formData.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Employee full name" /></FormField>
                                <FormField label="Phone number" error={fieldErrors.phone} field="phone"><input data-field="phone" type="tel" value={formData.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+91 98765 43210" /></FormField>
                                {/* <FormField label="Email address" error={fieldErrors.email} field="email"><input data-field="email" type="email" value={formData.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@company.com" /></FormField> */}
                                <FormField label="Date of birth" error={fieldErrors.dob} field="dob"><input data-field="dob" type="date" value={formData.dob} onChange={(event) => updateForm('dob', event.target.value)} /></FormField>
                                <FormField label="Residential address" className="wide" error={fieldErrors.address} field="address"><textarea data-field="address" value={formData.address} onChange={(event) => updateForm('address', event.target.value)} placeholder="Full residential address" rows="3" /></FormField>
                            </div>
                        </div>
                    </section>

                    <section className="ed-document-section">
                        <div className="ed-section-title"><Landmark size={19} /><div><h3>Bank & identity details</h3><p>Payroll and statutory information</p></div></div>
                        <div className="ed-form-grid four-col">
                            <FormField label="Aadhaar number"><input value={formData.aadhaarNumber} onChange={(event) => updateForm('aadhaarNumber', event.target.value)} placeholder="0000 0000 0000" inputMode="numeric" /></FormField>
                            <FormField label="Bank name"><input value={formData.bankName} onChange={(event) => updateForm('bankName', event.target.value)} placeholder="Bank name" /></FormField>
                            <FormField label="Account number"><input value={formData.bankAccount} onChange={(event) => updateForm('bankAccount', event.target.value)} placeholder="Account number" inputMode="numeric" /></FormField>
                            <FormField label="IFSC code"><input value={formData.bankIfsc} onChange={(event) => updateForm('bankIfsc', event.target.value.toUpperCase())} placeholder="ABCD0123456" /></FormField>
                        </div>
                    </section>

                    <section className="ed-document-section">
                        <div className="ed-section-title"><BriefcaseBusiness size={19} /><div><h3>Work details</h3><p>Employment, payroll and attendance settings</p></div></div>
                        <div className="ed-form-grid three-col">
                            <FormField label="Employee ID" required error={fieldErrors.id}>
                                <input 
        data-field="id" 
        value={editingEmployeeId || formData.id} 
        onChange={(event) => updateForm('id', event.target.value)} 
        placeholder="Enter Employee ID" 
        disabled={Boolean(editingEmployeeId)} 
    />
    </FormField>
                            <FormField label="Designation"><input value={formData.role} onChange={(event) => updateForm('role', event.target.value)} placeholder="e.g. Accountant" /></FormField>
                            <FormField label="Department"><input value={formData.dept} onChange={(event) => updateForm('dept', event.target.value)} placeholder="e.g. Finance" /></FormField>
                            <FormField label="Employment type">
                                <select value={formData.employmentType} onChange={(event) => updateForm('employmentType', event.target.value)}>
                                    <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option>
                                </select>
                            </FormField>
                            <FormField label="Joining date"><input type="date" value={formData.joinDate} onChange={(event) => updateForm('joinDate', event.target.value)} /></FormField>
                            <FormField label="Basic salary (₹/month)" required error={fieldErrors.salary}><input data-field="salary" type="number" min="0" step="0.01" value={formData.salary} onChange={(event) => updateForm('salary', event.target.value)} placeholder="30000" /></FormField>
                            <FormField label="Standard check-in" required error={fieldErrors.checkin}>
    <input data-field="checkin" type="time" value={formData.checkin} onChange={(event) => updateForm('checkin', event.target.value)} />
</FormField>
                            <div className="ed-form-field ed-weekoff-field">
                                <span>Week-off days</span>
                                <div className="ed-weekoff-list">
                                    {DAYSHORT.map((day, index) => (
                                        <button key={day} type="button" className={formData.weekoffs.includes(index) ? 'selected' : ''} onClick={() => toggleWeekoff(index)}>{day}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {!editingEmployeeId && (
                            <div className="ed-biometric-row">
                                <button type="button" className="ed-secondary-action" onClick={fetchBiometricIds} disabled={fetchingBioIds}>
                                    {fetchingBioIds ? 'Loading IDs…' : 'Use biometric employee ID'}
                                </button>
                                {showBioDropdown && (
                                    <select
                                        value={formData.id}
                                        onChange={(event) => {
                                            const biometricEmployee = biometricIds.find(item => item.id === event.target.value);
                                            setFormData(previous => ({ ...previous, id: event.target.value, name: previous.name || biometricEmployee?.name || '' }));
                                        }}
                                    >
                                        <option value="">Select biometric ID</option>
                                        {biometricIds.map(item => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
                                    </select>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="ed-document-section ed-upload-section">
                        <div className="ed-section-title"><FileText size={19} /><div><h3>Documents</h3><p>Aadhaar, bank proof and voter ID are mandatory. Driving licence is optional.</p></div></div>
                        {assetError && <div className="ed-inline-error">{assetError}</div>}
                        {renderDocumentCards(editingEmployeeId ? 'edit' : 'new')}
                    </section>

                    <footer className="ed-form-footer">
                        <button type="button" className="ed-secondary-action" onClick={closeForm} disabled={saving}>Cancel</button>
                        <button type="button" className="ed-primary-action" onClick={handleSave} disabled={saving}>{saving ? 'Saving employee…' : 'Save employee'}</button>
                    </footer>
                </div>
            ) : selectedEmployee ? (
                <article className="employee-document">
                    <header className="ed-profile-header">
                        <div className="ed-profile-identity">
                            <div className="ed-photo-viewer">
                                {photoUrl
                                    ? <img src={photoUrl} alt={`${selectedEmployee.name} profile`} />
                                    : <div className="ed-photo-placeholder"><UserRound size={42} /></div>
                                }
                            </div>
                            <div>
                                <span className="ed-document-kicker">Employee record · {selectedEmployee.id}</span>
                                <h1>{selectedEmployee.name}</h1>
                                <p>{selectedEmployee.role || 'No designation'}{selectedEmployee.dept ? ` · ${selectedEmployee.dept}` : ''}</p>
                            </div>
                        </div>
                        <div className="ed-header-actions">
                            <button type="button" className="ed-secondary-action" onClick={startEditEmployee}><Pencil size={16} /> Edit</button>
                            <button type="button" className="ed-danger-action" onClick={handleDelete} disabled={saving}><Trash2 size={16} /> Delete</button>
                        </div>
                    </header>

                    {assetError && <div className="ed-alert"><AlertCircle size={18} /> {assetError}</div>}

                    <section className="ed-document-section">
                        <div className="ed-section-title"><UserRound size={19} /><div><h3>Personal details</h3><p>Identity and contact information</p></div></div>
                        <div className="ed-detail-grid">
                            <DetailItem label="Full name" value={selectedEmployee.name} />
                            <DetailItem label="Phone number" value={selectedEmployee.phone} />
                            {/* <DetailItem label="Email address" value={selectedEmployee.email} /> */}
                            <DetailItem label="Date of birth" value={selectedEmployee.dob} />
                            <DetailItem label="Residential address" value={selectedEmployee.address} wide />
                        </div>
                    </section>

                    <section className="ed-document-section">
                        <div className="ed-section-title"><Landmark size={19} /><div><h3>Bank & identity details</h3><p>Payroll and statutory information</p></div></div>
                        <div className="ed-detail-grid four-col">
                            <DetailItem label="Aadhaar number" value={selectedEmployee.aadhaarNumber} />
                            <DetailItem label="Bank name" value={selectedEmployee.bankName} />
                            <DetailItem label="Account number" value={selectedEmployee.bankAccount} />
                            <DetailItem label="IFSC code" value={selectedEmployee.bankIfsc} />
                        </div>
                    </section>

                    <section className="ed-document-section">
                        <div className="ed-section-title"><BriefcaseBusiness size={19} /><div><h3>Work details</h3><p>Employment, payroll and attendance settings</p></div></div>
                        <div className="ed-detail-grid four-col">
                            <DetailItem label="Employee ID" value={selectedEmployee.id} />
                            <DetailItem label="Designation" value={selectedEmployee.role} />
                            <DetailItem label="Department" value={selectedEmployee.dept} />
                            <DetailItem label="Employment type" value={selectedEmployee.employmentType} />
                            <DetailItem label="Joining date" value={selectedEmployee.joinDate} />
                            <DetailItem label="Basic salary" value={formatCurrency(selectedEmployee.salary)} />
                            <DetailItem label="Standard check-in" value={selectedEmployee.checkin} />
                            <DetailItem label="Week-off days" value={selectedEmployee.weekoffs?.length ? selectedEmployee.weekoffs.map(day => DAYSHORT[day]).join(', ') : 'None set'} />
                        </div>
                    </section>

                    <section className="ed-document-section ed-upload-section">
                        <div className="ed-section-title"><FileText size={19} /><div><h3>Documents</h3><p>Download uploaded documents for this employee.</p></div></div>
                        {assetLoading ? <div className="ed-document-loading">Loading documents…</div> : renderDocumentCards('view')}
                    </section>
                </article>
            ) : (
                <div className="card employee-empty-state">
                    <div className="ed-empty-illustration">
                        <div><UserRound size={36} /></div>
                        <FileText size={28} />
                    </div>
                    <h2>No employee selected</h2>
                    <p>Choose an employee from the list above to open their record, or create a new employee profile.</p>
                </div>
            )}
        </div>
    );
};

export default Employees;
