import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { EnrollmentApplication, EnrollmentCategory } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert, FileImage,
  FileVideo2, LockKeyhole, ShieldCheck, Upload, Video, X,
} from 'lucide-react';
import './EnrollmentWizard.css';

type WizardAnswers = Record<string, unknown>;

export type EnrollmentWizardProps = {
  application: EnrollmentApplication;
  categories: EnrollmentCategory[];
  status: string;
  storageAvailable: boolean;
  maxUploadBytes: number;
  isSaving: boolean;
  isSubmitting: boolean;
  error: string;
  reopenedSections: number[];
  screenCopy?: Record<string, Record<string, string>>;
  saveStep: (answers: Record<string, unknown>, currentStep: number) => Promise<boolean>;
  submit: (answers: Record<string, unknown>) => Promise<boolean>;
  onChangeCategory: (categoryId: string) => void;
  onBackToCategoryEntry: (answers: Record<string, unknown>) => Promise<boolean>;
};

const stageTitles = [
  'Personal information',
  'Next of kin',
  'Education',
  'Work information',
  'Proof of identity',
  'Live video',
  'Bank details',
  'Preview & submit',
];

const categoryEntryLabels: Record<string, string> = {
  name: 'Category entry name',
  nickname: 'Nickname',
  surname: 'Surname',
};

const stageSchemas: z.ZodType<WizardAnswers>[] = [
  z.object({ personalInformation: z.object({
    firstName: z.string().trim().min(1, 'Enter your first name.'),
    middleName: z.string().optional(),
    surname: z.string().trim().min(1, 'Enter your surname.'),
    dateOfBirth: z.string().min(1, 'Enter your date of birth.'),
    nationality: z.string().trim().min(1, 'Enter your nationality.'),
    phone: z.string().trim().regex(/^\+?[0-9][0-9\s().-]{6,19}$/, 'Enter a valid phone number.'),
    email: z.string().trim().email('Enter a valid email address.'),
    residentialAddress: z.string().trim().min(1, 'Enter your residential address.'),
    stateRegion: z.string().trim().min(1, 'Enter your state or region.'),
    city: z.string().trim().min(1, 'Enter your city or local government area.'),
    postalCode: z.string().optional(),
  }) }),
  z.object({ nextOfKin: z.object({
    fullName: z.string().trim().min(1, 'Enter your next of kin’s full name.'),
    relationship: z.string().trim().min(1, 'Enter their relationship to you.'),
    phone: z.string().trim().regex(/^\+?[0-9][0-9\s().-]{6,19}$/, 'Enter a valid phone number.'),
    email: z.string().optional().refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.'),
    residentialAddress: z.string().trim().min(1, 'Enter their residential address.'),
    city: z.string().trim().min(1, 'Enter their city.'),
    stateRegion: z.string().trim().min(1, 'Enter their state or region.'),
  }) }),
  z.object({ education: z.object({
    highestQualification: z.string().trim().min(1, 'Select your highest qualification.'),
    institution: z.string().trim().min(1, 'Enter your institution.'),
    courseField: z.string().trim().min(1, 'Enter your course or field.'),
    startYear: z.string().trim().min(1, 'Enter your start year.'),
    completionYear: z.string().trim().min(1, 'Enter your completion year.'),
    certificationStatus: z.string().trim().min(1, 'Select your certification status.'),
    additionalQualifications: z.string().optional(),
    certificateObjectPath: z.string().optional(),
  }) }),
  z.object({ workInformation: z.object({
    employmentStatus: z.string().min(1, 'Select your employment status.'),
    occupation: z.string().optional(),
    employer: z.string().optional(),
    businessName: z.string().optional(),
    workAddress: z.string().optional(),
    workPhone: z.string().optional(),
    yearsExperience: z.string().optional(),
  }).superRefine((values, context) => {
    if (values.employmentStatus === 'Employed') {
      if (!values.occupation?.trim()) context.addIssue({ code: 'custom', path: ['occupation'], message: 'Enter your occupation.' });
      if (!values.employer?.trim()) context.addIssue({ code: 'custom', path: ['employer'], message: 'Enter your employer.' });
        if (!values.workAddress?.trim()) context.addIssue({ code: 'custom', path: ['workAddress'], message: 'Enter your work address.' });
    }
    if (values.employmentStatus === 'Self-employed') {
      if (!values.businessName?.trim()) context.addIssue({ code: 'custom', path: ['businessName'], message: 'Enter your business name.' });
      if (!values.workAddress?.trim()) context.addIssue({ code: 'custom', path: ['workAddress'], message: 'Enter your business or work address.' });
    }
  }) }),
  z.object({ proofOfIdentity: z.object({
    documentType: z.string().min(1, 'Select a document type.'),
    documentNumber: z.string().optional(),
    frontObjectPath: z.string().optional(),
    backObjectPath: z.string().optional(),
  }) }),
  z.object({ liveVideoRecording: z.object({
    consentAccepted: z.literal(true, { errorMap: () => ({ message: 'Please provide your consent before recording.' }) }),
    durationSeconds: z.number().optional(),
    objectPath: z.string().optional(),
  }) }),
  z.object({ bankDetails: z.object({
    bankName: z.string().optional(),
    accountHolder: z.string().optional(),
    accountNumber: z.string().optional(),
    accountType: z.string().optional(),
    accountNumberMasked: z.string().optional(),
  }).superRefine((values, context) => {
    const anyValue = [values.bankName, values.accountHolder, values.accountNumber, values.accountType]
      .some((value) => Boolean(value?.trim()));
    if (anyValue) {
      if (!values.bankName?.trim()) context.addIssue({ code: 'custom', path: ['bankName'], message: 'Enter your bank name.' });
      if (!values.accountHolder?.trim()) context.addIssue({ code: 'custom', path: ['accountHolder'], message: 'Enter the account holder name.' });
      if (!values.accountNumber?.trim() && !values.accountNumberMasked) {
        context.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Enter your account number.' });
      }
      if (values.accountNumber?.trim() && !/^\d{8,20}$/.test(values.accountNumber.replace(/\s/g, ''))) {
        context.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Enter 8 to 20 digits.' });
      }
    }
  }) }),
  z.object({ reviewDeclarationAccepted: z.literal(true, { errorMap: () => ({ message: 'Confirm the declaration before submitting.' }) }) }),
];

const sectionKeys = ['personalInformation', 'nextOfKin', 'education', 'workInformation', 'proofOfIdentity', 'liveVideoRecording', 'bankDetails', 'reviewDeclarationAccepted'];

function section(answers: WizardAnswers, key: string): WizardAnswers {
  const value = answers[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as WizardAnswers : {};
}

function answer(answers: WizardAnswers, sectionKey: string, key: string): unknown {
  return section(answers, sectionKey)[key];
}

function resumeAt(currentStep: number, reopenedSections: number[]) {
  const persisted = Math.min(7, Math.max(0, currentStep || 0));
  if (reopenedSections.length === 0 || persisted === 7 || reopenedSections.includes(persisted)) return persisted;
  return Math.min(...reopenedSections);
}

function textValue(answers: WizardAnswers, key: string) {
  const value = answers[key];
  return typeof value === 'string' ? value : '';
}

function isFilled(answers: WizardAnswers, key: string) {
  const value = answers[key];
  return value === true || (typeof value === 'string' && value.trim().length > 0);
}

function Field({ label, name, register, error, optional, type = 'text', placeholder, autoComplete, testId, ...props }: {
  label: string;
  name: string;
  register: ReturnType<typeof useForm<WizardAnswers>>['register'];
  error?: string;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  testId?: string;
  [key: string]: unknown;
}) {
  const id = `enroll-${name}`;
  return <label className="ew-field" htmlFor={id}>
    <span className="ew-label">{label}{optional && <small>Optional</small>}</span>
    <input id={id} className={`ew-input ${error ? 'has-error' : ''}`} type={type} placeholder={placeholder}
      autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
      data-testid={testId ?? `input-${name}`} {...register(name)} {...props} />
    {error && <span className="ew-field-error" id={`${id}-error`} role="alert" data-testid={`error-${name}`}>{error}</span>}
  </label>;
}

function SelectField({ label, name, register, error, options, placeholder = 'Choose an option', testId }: {
  label: string;
  name: string;
  register: ReturnType<typeof useForm<WizardAnswers>>['register'];
  error?: string;
  options: string[];
  placeholder?: string;
  testId?: string;
}) {
  const id = `enroll-${name}`;
  return <label className="ew-field" htmlFor={id}>
    <span className="ew-label">{label}</span>
    <span className="ew-select-wrap"><select id={id} className={`ew-input ew-select ${error ? 'has-error' : ''}`}
      aria-invalid={Boolean(error)} data-testid={testId ?? `select-${name}`} {...register(name)}>
      <option value="">{placeholder}</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select><ChevronDown size={15} aria-hidden="true" /></span>
    {error && <span className="ew-field-error" role="alert" data-testid={`error-${name}`}>{error}</span>}
  </label>;
}

function StageHeading({ index, title, detail, sectionIdLabel }: { index: number; title: string; detail: string; sectionIdLabel?: string }) {
  return <div className="ew-stage-heading">
    <span className="ew-stage-number">{sectionIdLabel || `0${index + 1}`} <i>/ 08</i></span>
    <h2>{title}</h2><p>{detail}</p>
  </div>;
}

type LocalImage = { file: File; url: string };

export function EnrollmentWizard({
  application, categories, status, storageAvailable, maxUploadBytes, isSaving, isSubmitting, error,
  reopenedSections, screenCopy = {}, saveStep, submit, onChangeCategory,
  onBackToCategoryEntry,
}: EnrollmentWizardProps) {
  const copyForStep = (index: number) => screenCopy[`workflow-step-${index + 1}`] ?? {};
  const titleForStep = (index: number) => copyForStep(index).title || stageTitles[index];
  const fieldLabel = (index: number, path: string, fallback: string) =>
    copyForStep(index)[`field_${path.replaceAll('.', '_')}`]?.trim() || fallback;
  const saved = application.answers ?? {};
  const [answers, setAnswers] = useState<WizardAnswers>(() => {
    const initial = { ...saved };
    if (initial.bankDetails && typeof initial.bankDetails === 'object') {
      const bank = { ...initial.bankDetails as WizardAnswers };
      delete bank.accountNumber;
      initial.bankDetails = bank;
    }
    return initial;
  });
  const [step, setStep] = useState(() => resumeAt(application.currentStep, reopenedSections));
  const [editingFromPreview, setEditingFromPreview] = useState(false);
  const [localImages, setLocalImages] = useState<Record<string, LocalImage>>({});
  const [cameraState, setCameraState] = useState<'idle' | 'ready' | 'recording' | 'recorded' | 'denied' | 'unsupported'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordingConfirmed, setRecordingConfirmed] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountNumberProvided, setAccountNumberProvided] = useState(() => Boolean(section(saved, 'bankDetails').accountNumberMasked));
  const [submitError, setSubmitError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingUrlRef = useRef('');
  const timerRef = useRef<number | null>(null);
  const imageUrlsRef = useRef<string[]>([]);
  const reopenedSignature = reopenedSections.join(',');
  const allowedSections = reopenedSections.length > 0 ? new Set(reopenedSections) : null;
  const readOnly = status !== 'draft' && reopenedSections.length === 0;
  const canEditSection = (sectionIndex: number) => !readOnly && (!allowedSections || allowedSections.has(sectionIndex));
  const category = categories.find((item) => item.id === application.categoryId);
  const form = useForm<WizardAnswers>({
    defaultValues: answers,
    resolver: zodResolver(stageSchemas[Math.min(step, 7)]),
    mode: 'onSubmit',
  });
  const { register, handleSubmit, formState, watch, setValue, reset, getValues } = form;
  const employmentStatus = watch('workInformation.employmentStatus');
  const documentType = watch('proofOfIdentity.documentType');
  const isBackRequired = ['National ID', 'Driver license', 'Passport card'].includes(String(documentType));
  const declarationAccepted = Boolean(watch('reviewDeclarationAccepted'));

  useEffect(() => {
    const safeSaved = { ...saved };
    if (safeSaved.bankDetails && typeof safeSaved.bankDetails === 'object') {
      const bank = { ...safeSaved.bankDetails as WizardAnswers };
      delete bank.accountNumber;
      safeSaved.bankDetails = bank;
    }
    setAnswers(safeSaved);
    setAccountNumberProvided(Boolean(section(safeSaved, 'bankDetails').accountNumberMasked));
    if (section(safeSaved, 'bankDetails').accountNumberMasked) setAccountNumberProvided(true);
    reset(safeSaved);
    setStep(resumeAt(application.currentStep, reopenedSections));
  }, [application.id, application.updatedAt, application.currentStep, reopenedSignature, reset]);

  useEffect(() => () => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [application.id]);

  useEffect(() => {
    if (cameraState === 'ready' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [cameraState]);

  const updateLocalImage = (key: string, file?: File) => {
    setLocalImages((current) => {
      const prior = current[key];
      if (prior) URL.revokeObjectURL(prior.url);
      if (!file) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      const url = URL.createObjectURL(file);
      imageUrlsRef.current.push(url);
      return { ...current, [key]: { file, url } };
    });
  };

  const onImageChange = (key: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > maxUploadBytes) {
      setSubmitError(`That image is larger than the displayed ${Math.round(maxUploadBytes / 1024 / 1024)} MiB limit.`);
      event.target.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSubmitError('Choose a JPEG, PNG, or WebP image to preview.');
      event.target.value = '';
      return;
    }
    setSubmitError('');
    updateLocalImage(key, file);
    event.target.value = '';
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const requestCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCameraState('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setCameraState('ready');
    } catch {
      setCameraState('denied');
      setCameraError('Camera or microphone access was not granted. You can try again in your browser settings.');
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setCameraState('unsupported');
      return;
    }
    try {
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorderRef.current = recorder;
      setRecordingConfirmed(false);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        recordingUrlRef.current = url;
        setRecordingUrl(url);
        setCameraState('recorded');
        stopCamera();
      };
      recorder.start();
      setRecordingSeconds(0);
      setCameraState('recording');
      const began = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.min(12, Math.floor((Date.now() - began) / 1000));
        setRecordingSeconds(elapsed);
        if (elapsed >= 12) {
          if (timerRef.current !== null) window.clearInterval(timerRef.current);
          timerRef.current = null;
          if (recorder.state !== 'inactive') recorder.stop();
        }
      }, 100);
    } catch {
      setCameraError('Recording is not available in this browser. You can try another browser.');
      setCameraState('unsupported');
    }
  };

  const clearRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = '';
    setRecordingUrl('');
    setRecordingConfirmed(false);
    setRecordingSeconds(0);
    setCameraError('');
    void requestCamera();
  };

  const persistStage = async (data: WizardAnswers) => {
    const sectionKey = sectionKeys[step];
    const values = { ...section(data, sectionKey) };
    const outgoing = { ...answers, [sectionKey]: values };
    if (step === 5 && recordingUrl && recordingConfirmed) outgoing.liveVideoRecording = { ...values, durationSeconds: 12 };
    if (step === 6) {
      if (accountNumber) outgoing.bankDetails = { ...values, accountNumber };
      else {
        const { accountNumber: _notSubmitted, ...maskedValues } = values;
        outgoing.bankDetails = maskedValues;
      }
    }
    const safeSection = { ...values };
    delete safeSection.accountNumber;
    if (step === 5 && recordingUrl && recordingConfirmed) safeSection.durationSeconds = 12;
    const merged = { ...answers, [sectionKey]: safeSection };
    const targetStep = editingFromPreview ? 7 : Math.min(7, step + 1);
    const savedOk = await saveStep(outgoing, targetStep);
    if (!savedOk) return;
    setAnswers(merged);
    if (step === 6) {
      setAccountNumberProvided(Boolean(accountNumber) || Boolean(values.accountNumberMasked));
      setAccountNumber('');
      reset(merged);
    }
    if (editingFromPreview) {
      setStep(targetStep);
      setEditingFromPreview(false);
      return;
    }
    setStep(targetStep);
  };

  const saveAndContinue = () => persistStage(getValues());

  const goBack = () => {
    if (editingFromPreview) {
      setStep(7);
      setEditingFromPreview(false);
      return;
    }
    if (step === 0) {
      const values = getValues();
      const currentPersonal = section(values, 'personalInformation');
      const backAnswers = { ...answers, personalInformation: currentPersonal };
      void onBackToCategoryEntry(backAnswers);
      return;
    }
    setStep(Math.max(0, step - 1));
  };

  const openEdit = (index: number) => {
    if (!canEditSection(index)) return;
    reset({ ...answers });
    setStep(index);
    setEditingFromPreview(true);
  };

  const beginSubmit = async () => {
    setSubmitError('');
    const accepted = await handleSubmit(async (data) => {
      const merged = { ...answers, reviewDeclarationAccepted: data.reviewDeclarationAccepted };
      setAnswers(merged);
      const savedOk = await saveStep(merged, 7);
      if (!savedOk) {
        setSubmitError('Your declaration could not be saved. Please try again.');
        return;
      }
      const ok = await submit(merged);
      if (!ok) setSubmitError('We could not submit your application. Your saved details remain available.');
    })();
    if (!accepted) setSubmitError('Review the declaration before submitting.');
  };

  const categoryEntry = Object.entries(categoryEntryLabels)
    .filter(([key]) => typeof answers[key] === 'string' && textValue(answers, key).trim())
    .map(([key, label]) => {
      const categoryCopy = screenCopy[`category-entry-${application.categoryId}`] ?? {};
      const labelKey = key === 'name' ? 'nameLabel' : key === 'nickname' ? 'nicknameLabel' : 'surnameLabel';
      return { key, label: categoryCopy[labelKey]?.trim() || label, value: textValue(answers, key) };
    });

  const sectionComplete = (index: number) => {
    const values = section(answers, sectionKeys[index]);
    const required: string[] = [
      ['firstName', 'surname', 'dateOfBirth', 'nationality', 'phone', 'email', 'residentialAddress', 'stateRegion', 'city'],
      ['fullName', 'relationship', 'phone', 'residentialAddress', 'city', 'stateRegion'],
      ['highestQualification', 'institution', 'courseField', 'startYear', 'completionYear', 'certificationStatus'],
      ['employmentStatus'],
      ['documentType'],
      ['consentAccepted'],
      ['bankName', 'accountHolder'],
      [],
    ][index];
    if (required.some((key) => !isFilled(values, key))) return false;
    if (index === 3) {
      if (values.employmentStatus === 'Employed') return isFilled(values, 'occupation') && isFilled(values, 'employer') && isFilled(values, 'workAddress');
      if (values.employmentStatus === 'Self-employed') return isFilled(values, 'businessName') && isFilled(values, 'workAddress');
    }
    if (index === 4) {
      const hasFront = Boolean(values.frontObjectPath);
      const requiresBack = ['National ID', 'Driver license', 'Passport card'].includes(String(values.documentType));
      const hasBack = !requiresBack || Boolean(values.backObjectPath);
      return hasFront && hasBack;
    }
    if (index === 5) return Boolean(values.objectPath);
    if (index === 6) {
      const anyValue = ['bankName', 'accountHolder', 'accountType'].some((key) => isFilled(values, key)) || accountNumberProvided || Boolean(values.accountNumberMasked);
      return !anyValue || (isFilled(values, 'bankName') && isFilled(values, 'accountHolder') && (accountNumberProvided || Boolean(values.accountNumberMasked)));
    }
    return true;
  };

  const missingUploads = useMemo(() => {
    const missing: string[] = [];
    if (!answer(answers, 'proofOfIdentity', 'frontObjectPath')) missing.push('identity document front');
    if (isBackRequired && !answer(answers, 'proofOfIdentity', 'backObjectPath')) missing.push('identity document back');
    if (!answer(answers, 'liveVideoRecording', 'objectPath')) missing.push('video reference');
    if (!storageAvailable) missing.push('storage-backed references (secure storage unavailable)');
    return missing;
  }, [answers, isBackRequired, storageAvailable]);
  const readyToSubmit = stageTitles.slice(0, 7).every((_, index) => sectionComplete(index)) && declarationAccepted && missingUploads.length === 0;

  const stageErrors = formState.errors as Record<string, unknown>;
  const errorFor = (path: string) => {
    const errorObject = path.split('.').reduce<unknown>((current, part) =>
      current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, stageErrors);
    return errorObject && typeof errorObject === 'object' && 'message' in errorObject
      ? String((errorObject as { message: unknown }).message) : undefined;
  };

  const renderFileUploader = (key: string, label: string, sectionIndex: number) => {
    const local = localImages[key];
    const referenceKey: Record<string, [string, string]> = {
      educationCertificate: ['education', 'certificateObjectPath'],
      identityFront: ['proofOfIdentity', 'frontObjectPath'],
      identityBack: ['proofOfIdentity', 'backObjectPath'],
    };
    const reference = referenceKey[key] ? answer(answers, ...referenceKey[key]) : undefined;
    const completedReference = Boolean(reference);
    return <div className="ew-upload-block" data-testid={`state-upload-${key}`}>
      <div className="ew-upload-heading"><span className="ew-upload-icon"><FileImage size={17} /></span>
        <div><b>{label}</b><small>{completedReference ? 'A stored file reference is on this application.' : 'No file has been uploaded to secure storage.'}</small></div>
      </div>
      {local && <div className="ew-image-preview">
        <img src={local.url} alt={`Local preview of ${label.toLowerCase()}`} data-testid={`preview-${key}`} />
        <div><b>{local.file.name}</b><small>Local preview only · not uploaded</small></div>
        <button type="button" className="ew-icon-button" onClick={() => updateLocalImage(key)} aria-label={`Remove ${label.toLowerCase()} preview`} data-testid={`button-remove-${key}`}><X size={16} /></button>
      </div>}
      <div className="ew-upload-controls">
        <label className={`ew-file-button ${!canEditSection(sectionIndex) ? 'is-disabled' : ''}`}>
          <Upload size={15} /> {local ? 'Replace local preview' : 'Choose image for preview'}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canEditSection(sectionIndex)} onChange={onImageChange(key)} data-testid={`input-file-${key}`} />
        </label>
        <span className="ew-size-note">Images · up to {Math.round(maxUploadBytes / 1024 / 1024)} MiB</span>
      </div>
      {!storageAvailable && <p className="ew-inline-notice" data-testid={`notice-storage-${key}`}><LockKeyhole size={14} /> Secure file storage is unavailable. This local preview will not be saved or submitted.</p>}
    </div>;
  };

  const renderReviewField = (label: string, value: unknown, testId: string) => {
    const display = typeof value === 'string' && value.trim() ? value : 'Not provided';
    return <div className="ew-review-row" key={testId} data-testid={`review-${testId}`}><span>{label}</span><b>{display}</b></div>;
  };

  const reviewStage = (index: number, title: string, fields: [string, unknown, string][]) => (
    <section className={`ew-review-section ${sectionComplete(index) ? 'is-complete' : ''}`} key={title} data-testid={`review-section-${index}`}>
      <header><div className="ew-review-title"><span className="ew-review-dot">{sectionComplete(index) ? <Check size={12} /> : `0${index + 1}`}</span><h3>{title}</h3></div>
        <span className={`ew-review-status ${sectionComplete(index) ? 'complete' : 'incomplete'}`} data-testid={`status-section-${index}`}>{sectionComplete(index) ? 'Complete' : 'Incomplete'}</span>
        {canEditSection(index) && <button type="button" className="ew-edit-link" onClick={() => openEdit(index)} data-testid={`button-edit-section-${index}`}>Edit</button>}
      </header>
      <div className="ew-review-fields">{fields.map(([label, value, key]) => renderReviewField(label, value, key))}</div>
    </section>
  );

  const categoryReview = <section className="ew-category-review" data-testid="review-category">
    <div className="ew-category-top"><div><span className="ew-mini-label">ENROLLMENT CATEGORY</span><h3>{application.categoryName}</h3>
      <p>{category?.description ?? 'The enrollment category attached to this application.'}</p></div>
      {categories.length > 1 && !readOnly && !allowedSections && <label className="ew-category-change">Change category
        <select value={application.categoryId} onChange={(event) => onChangeCategory(event.target.value)} aria-label="Change enrollment category" data-testid="select-category-change">
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select><ChevronDown size={14} />
      </label>}
    </div>
    {categoryEntry.length > 0 && <div className="ew-category-details">{categoryEntry.map((item) => renderReviewField(item.label, item.value, `category-${item.key}`))}</div>}
  </section>;

  const uploadProgress = Math.min(100, Math.round((recordingSeconds / 12) * 100));

  return <main className="ew-shell" data-testid="enrollment-wizard">
    <header className="ew-topbar">
      <div className="ew-topbrand"><span><ShieldCheck size={18} /></span><b>Security Verification<small>Enrollment Portal</small></b></div>
      <div className="ew-top-meta"><span className={`ew-draft-status ${status === 'draft' ? '' : 'submitted'}`} data-testid="status-application">{status.replaceAll('_', ' ')}</span>
        <span className="ew-reference" data-testid="text-application-reference">{application.reference}</span></div>
    </header>
    <div className="ew-layout">
      <aside className="ew-rail">
        <div className="ew-rail-intro"><span className="ew-mini-label">YOUR APPLICATION</span><h1>One step<br /><em>at a time.</em></h1>
          <p>Your progress is saved as you move through each section.</p></div>
        <nav className="ew-steps" aria-label="Application sections">
          {stageTitles.map((_title, index) => {
            const title = titleForStep(index);
            const active = step === index;
            const done = index < 7 && sectionComplete(index);
            const available = index === 7 || canEditSection(index);
            return <button key={title} type="button" className={`ew-step-nav ${active ? 'active' : ''} ${done ? 'done' : ''}`}
              disabled={!available || readOnly} onClick={() => {
                if (index === 7) setStep(7);
                else if (allowedSections ? allowedSections.has(index) : index <= step) setStep(index);
              }}
              aria-current={active ? 'step' : undefined} data-testid={`button-stage-${index}`}>
              <span className="ew-step-marker">{done ? <Check size={13} /> : `0${index + 1}`}</span><span>{title}</span>
            </button>;
          })}
        </nav>
        <div className="ew-rail-security" data-testid="notice-privacy"><LockKeyhole size={16} /><span><b>Your details stay private</b><small>Only share information requested for enrollment.</small></span></div>
      </aside>

      <section className="ew-main" aria-live="polite">
        <div className="ew-mobile-progress" data-testid="text-progress">SECTION {String(step + 1).padStart(2, '0')} OF 08</div>
        {step < 7 ? <form className="ew-form" onSubmit={(event) => { event.preventDefault(); void saveAndContinue(); }} noValidate>
          <div className="ew-content-scroll">
            <div className="ew-progress-line"><span style={{ width: `${((step + 1) / 8) * 100}%` }} /></div>
            {step === 0 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "Enter the personal details that identify your application."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <div className="ew-fields-grid">
                <Field label={fieldLabel(0, 'personalInformation.firstName', 'First name')} name="personalInformation.firstName" register={register} error={errorFor('personalInformation.firstName')} autoComplete="given-name" />
                <Field label={fieldLabel(0, 'personalInformation.middleName', 'Middle name')} name="personalInformation.middleName" register={register} optional autoComplete="additional-name" />
                <Field label={fieldLabel(0, 'personalInformation.surname', 'Surname')} name="personalInformation.surname" register={register} error={errorFor('personalInformation.surname')} autoComplete="family-name" />
                <Field label={fieldLabel(0, 'personalInformation.dateOfBirth', 'Date of birth')} name="personalInformation.dateOfBirth" register={register} error={errorFor('personalInformation.dateOfBirth')} type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
                <Field label={fieldLabel(0, 'personalInformation.nationality', 'Nationality')} name="personalInformation.nationality" register={register} error={errorFor('personalInformation.nationality')} autoComplete="country-name" />
                <Field label={fieldLabel(0, 'personalInformation.phone', 'Phone number')} name="personalInformation.phone" register={register} error={errorFor('personalInformation.phone')} type="tel" autoComplete="tel" />
                <Field label={fieldLabel(0, 'personalInformation.email', 'Email address')} name="personalInformation.email" register={register} error={errorFor('personalInformation.email')} type="email" autoComplete="email" />
                <Field label={fieldLabel(0, 'personalInformation.residentialAddress', 'Residential address')} name="personalInformation.residentialAddress" register={register} error={errorFor('personalInformation.residentialAddress')} autoComplete="street-address" />
                <Field label={fieldLabel(0, 'personalInformation.stateRegion', 'State / region')} name="personalInformation.stateRegion" register={register} error={errorFor('personalInformation.stateRegion')} autoComplete="address-level1" />
                <Field label={fieldLabel(0, 'personalInformation.city', 'City / local government area')} name="personalInformation.city" register={register} error={errorFor('personalInformation.city')} autoComplete="address-level2" />
                <Field label={fieldLabel(0, 'personalInformation.postalCode', 'Postal code')} name="personalInformation.postalCode" register={register} optional autoComplete="postal-code" />
              </div>
            </>}
            {step === 1 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "Name someone we may contact if we need to reach you."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <div className="ew-fields-grid">
                <Field label={fieldLabel(1, 'nextOfKin.fullName', 'Full name')} name="nextOfKin.fullName" register={register} error={errorFor('nextOfKin.fullName')} autoComplete="off" />
                <Field label={fieldLabel(1, 'nextOfKin.relationship', 'Relationship')} name="nextOfKin.relationship" register={register} error={errorFor('nextOfKin.relationship')} />
                <Field label={fieldLabel(1, 'nextOfKin.phone', 'Phone number')} name="nextOfKin.phone" register={register} error={errorFor('nextOfKin.phone')} type="tel" autoComplete="off" />
                <Field label={fieldLabel(1, 'nextOfKin.email', 'Email address')} name="nextOfKin.email" register={register} optional type="email" autoComplete="off" />
                <Field label={fieldLabel(1, 'nextOfKin.residentialAddress', 'Residential address')} name="nextOfKin.residentialAddress" register={register} error={errorFor('nextOfKin.residentialAddress')} />
                <Field label={fieldLabel(1, 'nextOfKin.city', 'City')} name="nextOfKin.city" register={register} error={errorFor('nextOfKin.city')} />
                <Field label={fieldLabel(1, 'nextOfKin.stateRegion', 'State / region')} name="nextOfKin.stateRegion" register={register} error={errorFor('nextOfKin.stateRegion')} />
              </div>
              <div className="ew-callout" data-testid="notice-next-of-kin"><ShieldCheck size={17} /><p><b>Authorization reminder</b><br />Your next of kin is a contact only. This does not authorize them to act for you or access your application.</p></div>
            </>}
            {step === 2 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "Tell us about your education and any relevant qualifications."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <div className="ew-fields-grid">
                <SelectField label={fieldLabel(2, 'education.highestQualification', 'Highest qualification')} name="education.highestQualification" register={register} error={errorFor('education.highestQualification')}
                  options={['Primary education', 'Secondary education', 'Certificate', 'Diploma', 'Bachelor’s degree', 'Postgraduate degree', 'Other']} />
                <Field label={fieldLabel(2, 'education.institution', 'Institution')} name="education.institution" register={register} error={errorFor('education.institution')} />
                <Field label={fieldLabel(2, 'education.courseField', 'Course / field')} name="education.courseField" register={register} error={errorFor('education.courseField')} />
                <Field label={fieldLabel(2, 'education.startYear', 'Start year')} name="education.startYear" register={register} error={errorFor('education.startYear')} type="number" min="1900" max={new Date().getFullYear() + 10} inputMode="numeric" />
                <Field label={fieldLabel(2, 'education.completionYear', 'Completion year')} name="education.completionYear" register={register} error={errorFor('education.completionYear')} type="number" min="1900" max={new Date().getFullYear() + 10} inputMode="numeric" />
                <SelectField label={fieldLabel(2, 'education.certificationStatus', 'Certification status')} name="education.certificationStatus" register={register} error={errorFor('education.certificationStatus')} options={['Completed', 'Awaiting certificate', 'In progress']} />
                <Field label={fieldLabel(2, 'education.additionalQualifications', 'Additional qualifications')} name="education.additionalQualifications" register={register} optional />
              </div>
              {renderFileUploader('educationCertificate', fieldLabel(2, 'education.certificateObjectPath', 'Certificate image'), 2)}
            </>}
            {step === 3 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "Share your current work situation. We do not ask for income."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <div className="ew-fields-grid">
                <SelectField label={fieldLabel(3, 'workInformation.employmentStatus', 'Employment status')} name="workInformation.employmentStatus" register={register} error={errorFor('workInformation.employmentStatus')}
                  options={['Employed', 'Self-employed', 'Not currently employed']} />
                {employmentStatus === 'Employed' && <>
                  <Field label={fieldLabel(3, 'workInformation.occupation', 'Occupation')} name="workInformation.occupation" register={register} error={errorFor('workInformation.occupation')} />
                  <Field label={fieldLabel(3, 'workInformation.employer', 'Employer')} name="workInformation.employer" register={register} error={errorFor('workInformation.employer')} />
                </>}
                {employmentStatus === 'Self-employed' && <>
                  <Field label={fieldLabel(3, 'workInformation.businessName', 'Business name')} name="workInformation.businessName" register={register} error={errorFor('workInformation.businessName')} />
                  <Field label={fieldLabel(3, 'workInformation.workAddress', 'Business / work address')} name="workInformation.workAddress" register={register} error={errorFor('workInformation.workAddress')} />
                  <Field label={fieldLabel(3, 'workInformation.workPhone', 'Work phone')} name="workInformation.workPhone" register={register} optional type="tel" />
                  <Field label={fieldLabel(3, 'workInformation.yearsExperience', 'Years of experience')} name="workInformation.yearsExperience" register={register} optional type="number" min="0" />
                </>}
              </div>
            </>}
            {step === 4 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "Choose an identity document and add its images when storage is available."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <div className="ew-fields-grid ew-fields-single">
                <SelectField label={fieldLabel(4, 'proofOfIdentity.documentType', 'Document type')} name="proofOfIdentity.documentType" register={register} error={errorFor('proofOfIdentity.documentType')}
                  options={['National ID', 'Passport', 'Driver license', 'Passport card', 'Other']} />
                <Field label={fieldLabel(4, 'proofOfIdentity.documentNumber', 'Document number')} name="proofOfIdentity.documentNumber" register={register} optional autoComplete="off" />
              </div>
              <div className="ew-upload-grid">{renderFileUploader('identityFront', fieldLabel(4, 'proofOfIdentity.frontObjectPath', 'Document front'), 4)}
                {isBackRequired && renderFileUploader('identityBack', fieldLabel(4, 'proofOfIdentity.backObjectPath', 'Document back'), 4)}</div>
              <div className="ew-storage-banner" data-testid="state-identity-incomplete"><CircleAlert size={17} /><div><b>Identity images are not yet attached</b>
                <p>Your previews stay on this device. Secure upload is currently unavailable, so they cannot be included with your application.</p></div></div>
            </>}
            {step === 5 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "A short recording can be made here, but it is not an identity or liveness check."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <div className="ew-video-consent">
                <label className="ew-consent-check"><input type="checkbox" {...register('liveVideoRecording.consentAccepted')} data-testid="check-video-consent" />
                  <span className="ew-checkmark" /><span>I consent to use my camera and microphone to make a 12-second video recording for this application.</span></label>
                {errorFor('liveVideoRecording.consentAccepted') && <span className="ew-field-error" role="alert" data-testid="error-liveVideoRecording.consentAccepted">{errorFor('liveVideoRecording.consentAccepted')}</span>}
              </div>
              <div className="ew-video-panel" data-testid="state-video-recording">
                {cameraState === 'recorded' && recordingUrl ? <video className="ew-video-preview" src={recordingUrl} controls playsInline data-testid="preview-recorded-video" /> :
                  cameraState === 'ready' || cameraState === 'recording' ? <video className="ew-video-preview" ref={videoRef} muted playsInline data-testid="preview-camera" /> :
                    <div className="ew-video-placeholder"><Video size={28} /><b>{cameraState === 'denied' ? 'Camera access was not granted' : cameraState === 'unsupported' ? 'Recording is unavailable' : 'Your camera stays off until you choose to begin'}</b>
                      <span>{cameraError || 'Nothing is recorded without your action.'}</span></div>}
                {cameraState === 'recording' && <div className="ew-record-progress" role="status" aria-label={`Recording ${recordingSeconds} of 12 seconds`}>
                  <div className="ew-record-progress-track"><span style={{ width: `${uploadProgress}%` }} /></div>
                  <span data-testid="text-recording-countdown">{Math.max(0, 12 - recordingSeconds)} seconds remaining</span></div>}
                <div className="ew-video-actions">
                  {cameraState === 'idle' || cameraState === 'denied' || cameraState === 'unsupported' ? <button type="button" className="ew-button ew-button-primary" onClick={() => void requestCamera()} data-testid="button-enable-camera"><Video size={16} /> Enable camera</button> : null}
                  {cameraState === 'ready' && <button type="button" className="ew-button ew-button-primary" disabled={!watch('liveVideoRecording.consentAccepted')} onClick={startRecording} data-testid="button-start-recording">Start 12-second recording <ArrowRight size={15} /></button>}
                  {cameraState === 'recording' && <span className="ew-recording-label"><i /> Recording in progress</span>}
                  {cameraState === 'recorded' && <><button type="button" className="ew-button ew-button-quiet" onClick={clearRecording} data-testid="button-retake-video">Retake recording</button>
                    <button type="button" className={`ew-button ${recordingConfirmed ? 'ew-button-confirmed' : 'ew-button-primary'}`}
                      onClick={() => setRecordingConfirmed(true)} data-testid="button-confirm-recording">
                      {recordingConfirmed ? <><Check size={15} /> Recording selected</> : 'Confirm recording'}
                    </button>
                    <span className="ew-local-tag"><FileVideo2 size={14} /> Local preview only</span></>}
                </div>
              </div>
              <div className="ew-storage-banner" data-testid="state-video-incomplete"><CircleAlert size={17} /><div><b>Recording is not saved to your application</b>
                <p>This recording remains in memory and will be cleared when you leave this page. Video storage is unavailable, so a saved video reference is still required.</p></div></div>
            </>}
            {step === 6 && <><StageHeading index={step} title={titleForStep(step)} detail={copyForStep(step).description || "Only provide bank details if they are genuinely needed for your enrollment."} sectionIdLabel={copyForStep(step).sectionIdLabel} />
              <p className="ew-inline-notice">This section is optional. If payment details are not required for your enrollment, leave it blank and continue.</p>
              <div className="ew-fields-grid ew-fields-single">
                <Field label={fieldLabel(6, 'bankDetails.bankName', 'Bank')} name="bankDetails.bankName" register={register} error={errorFor('bankDetails.bankName')} autoComplete="off" />
                <Field label={fieldLabel(6, 'bankDetails.accountHolder', 'Account holder')} name="bankDetails.accountHolder" register={register} error={errorFor('bankDetails.accountHolder')} autoComplete="name" />
                <label className="ew-field" htmlFor="enroll-accountNumber"><span className="ew-label">{fieldLabel(6, 'bankDetails.accountNumber', 'Account number')}</span>
                  <input id="enroll-accountNumber" name="accountNumber" className="ew-input" type="password" inputMode="numeric" autoComplete="off" value={accountNumber}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, '').slice(0, 20);
                      setAccountNumber(value);
                      setAccountNumberProvided(value.length > 0);
                      setValue('bankDetails.accountNumber' as never, value as never, { shouldValidate: true, shouldDirty: true });
                    }}
                    placeholder="Enter account number" data-testid="input-accountNumber" />
                  {errorFor('bankDetails.accountNumber') && <span className="ew-field-error" role="alert" data-testid="error-accountNumber">{errorFor('bankDetails.accountNumber')}</span>}
                  <span className="ew-help">Encrypted before storage and masked in your applicant view. Authorized reviewers can access it for review.</span>
                </label>
                <SelectField label={fieldLabel(6, 'bankDetails.accountType', 'Account type')} name="bankDetails.accountType" register={register} options={['Personal', 'Business']} placeholder="Optional" />
              </div>
              <div className="ew-storage-banner" data-testid="state-bank-privacy"><LockKeyhole size={17} /><div><b>Your account number is encrypted at rest</b>
                <p>It is never returned as plain text in your applicant record. Authorized reviewers access it through the protected review service.</p></div></div>
            </>}
            {error && <p className="ew-form-alert" role="alert" data-testid="text-save-error">{error}</p>}
            {submitError && <p className="ew-form-alert" role="alert" data-testid="text-local-input-error">{submitError}</p>}
          </div>
          <footer className="ew-form-footer">
            <button type="button" className="ew-button ew-button-quiet" onClick={goBack} disabled={isSaving} data-testid="button-wizard-back"><ArrowLeft size={15} /> {copyForStep(step).backButtonLabel || (step === 0 && !editingFromPreview ? 'Back to category details' : 'Back')}</button>
            {editingFromPreview && <button type="button" className="ew-button ew-button-quiet ew-return-preview" onClick={() => { setStep(7); setEditingFromPreview(false); }} data-testid="button-return-preview">Return to preview</button>}
            <span className="ew-save-note" data-testid="state-save-progress">{isSaving ? 'Saving your progress…' : 'Your work saves when you continue.'}</span>
            <button type="submit" className="ew-button ew-button-primary" disabled={isSaving || readOnly} data-testid="button-save-next">
              {isSaving ? 'Saving…' : editingFromPreview ? copyForStep(step).buttonLabel || 'Save and return' : copyForStep(step).buttonLabel || (step === 6 ? 'Save & preview' : 'Save & continue')} <ArrowRight size={15} /></button>
          </footer>
        </form> :
          <div className="ew-preview" data-testid="enrollment-preview">
            <div className="ew-content-scroll">
              <div className="ew-progress-line"><span style={{ width: '100%' }} /></div>
              <StageHeading index={7} title={titleForStep(7)} detail={copyForStep(7).description || "Check your details carefully. Incomplete secure uploads must be attached before you can submit."} sectionIdLabel={copyForStep(7).sectionIdLabel} />
              {categoryReview}
              <div className="ew-review-stack">
                {reviewStage(0, titleForStep(0), [
                  [fieldLabel(0, 'personalInformation.firstName', 'First name'), answer(answers, 'personalInformation', 'firstName'), 'firstName'], [fieldLabel(0, 'personalInformation.middleName', 'Middle name'), answer(answers, 'personalInformation', 'middleName'), 'middleName'], [fieldLabel(0, 'personalInformation.surname', 'Surname'), answer(answers, 'personalInformation', 'surname'), 'surname'],
                  [fieldLabel(0, 'personalInformation.dateOfBirth', 'Date of birth'), answer(answers, 'personalInformation', 'dateOfBirth'), 'dateOfBirth'], [fieldLabel(0, 'personalInformation.nationality', 'Nationality'), answer(answers, 'personalInformation', 'nationality'), 'nationality'], [fieldLabel(0, 'personalInformation.phone', 'Phone number'), answer(answers, 'personalInformation', 'phone'), 'phone'],
                  [fieldLabel(0, 'personalInformation.email', 'Email address'), answer(answers, 'personalInformation', 'email'), 'email'], [fieldLabel(0, 'personalInformation.residentialAddress', 'Residential address'), answer(answers, 'personalInformation', 'residentialAddress'), 'residentialAddress'], [fieldLabel(0, 'personalInformation.stateRegion', 'State / region'), answer(answers, 'personalInformation', 'stateRegion'), 'stateRegion'],
                  [fieldLabel(0, 'personalInformation.city', 'City / local government area'), answer(answers, 'personalInformation', 'city'), 'city'], [fieldLabel(0, 'personalInformation.postalCode', 'Postal code'), answer(answers, 'personalInformation', 'postalCode'), 'postalCode'],
                ])}
                {reviewStage(1, titleForStep(1), [
                  [fieldLabel(1, 'nextOfKin.fullName', 'Full name'), answer(answers, 'nextOfKin', 'fullName'), 'kinFullName'], [fieldLabel(1, 'nextOfKin.relationship', 'Relationship'), answer(answers, 'nextOfKin', 'relationship'), 'kinRelationship'], [fieldLabel(1, 'nextOfKin.phone', 'Phone number'), answer(answers, 'nextOfKin', 'phone'), 'kinPhone'],
                  [fieldLabel(1, 'nextOfKin.email', 'Email address'), answer(answers, 'nextOfKin', 'email'), 'kinEmail'], [fieldLabel(1, 'nextOfKin.residentialAddress', 'Residential address'), answer(answers, 'nextOfKin', 'residentialAddress'), 'kinAddress'], [fieldLabel(1, 'nextOfKin.city', 'City'), answer(answers, 'nextOfKin', 'city'), 'kinCity'], [fieldLabel(1, 'nextOfKin.stateRegion', 'State / region'), answer(answers, 'nextOfKin', 'stateRegion'), 'kinStateRegion'],
                ])}
                {reviewStage(2, titleForStep(2), [
                  [fieldLabel(2, 'education.highestQualification', 'Highest qualification'), answer(answers, 'education', 'highestQualification'), 'highestQualification'], [fieldLabel(2, 'education.institution', 'Institution'), answer(answers, 'education', 'institution'), 'institution'], [fieldLabel(2, 'education.courseField', 'Course / field'), answer(answers, 'education', 'courseField'), 'courseField'],
                  [fieldLabel(2, 'education.startYear', 'Start year'), answer(answers, 'education', 'startYear'), 'startYear'], [fieldLabel(2, 'education.completionYear', 'Completion year'), answer(answers, 'education', 'completionYear'), 'completionYear'], [fieldLabel(2, 'education.certificationStatus', 'Certification status'), answer(answers, 'education', 'certificationStatus'), 'certificationStatus'],
                  [fieldLabel(2, 'education.additionalQualifications', 'Additional qualifications'), answer(answers, 'education', 'additionalQualifications'), 'additionalQualifications'], [fieldLabel(2, 'education.certificateObjectPath', 'Certificate image'), answer(answers, 'education', 'certificateObjectPath') ? 'Uploaded reference attached' : 'Not uploaded', 'educationCertificate'],
                ])}
                {reviewStage(3, titleForStep(3), [
                  [fieldLabel(3, 'workInformation.employmentStatus', 'Employment status'), answer(answers, 'workInformation', 'employmentStatus'), 'employmentStatus'], [fieldLabel(3, 'workInformation.occupation', 'Occupation'), answer(answers, 'workInformation', 'occupation'), 'occupation'], [fieldLabel(3, 'workInformation.employer', 'Employer'), answer(answers, 'workInformation', 'employer'), 'employer'],
                  [fieldLabel(3, 'workInformation.businessName', 'Business name'), answer(answers, 'workInformation', 'businessName'), 'businessName'], [fieldLabel(3, 'workInformation.workAddress', 'Business / work address'), answer(answers, 'workInformation', 'workAddress'), 'workAddress'], [fieldLabel(3, 'workInformation.workPhone', 'Work phone'), answer(answers, 'workInformation', 'workPhone'), 'workPhone'], [fieldLabel(3, 'workInformation.yearsExperience', 'Years of experience'), answer(answers, 'workInformation', 'yearsExperience'), 'yearsExperience'],
                ])}
                {reviewStage(4, titleForStep(4), [
                  [fieldLabel(4, 'proofOfIdentity.documentType', 'Document type'), answer(answers, 'proofOfIdentity', 'documentType'), 'identityDocumentType'], [fieldLabel(4, 'proofOfIdentity.documentNumber', 'Document number'), answer(answers, 'proofOfIdentity', 'documentNumber'), 'identityDocumentNumber'],
                  [fieldLabel(4, 'proofOfIdentity.frontObjectPath', 'Document front'), answer(answers, 'proofOfIdentity', 'frontObjectPath') ? 'Uploaded reference attached' : 'Not uploaded', 'identityFront'],
                  [fieldLabel(4, 'proofOfIdentity.backObjectPath', 'Document back'), isBackRequired ? answer(answers, 'proofOfIdentity', 'backObjectPath') ? 'Uploaded reference attached' : 'Not uploaded' : 'Not applicable', 'identityBack'],
                ])}
                {reviewStage(5, titleForStep(5), [
                  ['Consent', answer(answers, 'liveVideoRecording', 'consentAccepted') ? 'Consent given' : 'Not confirmed', 'liveVideoConsent'],
                  ['Recording length', answer(answers, 'liveVideoRecording', 'durationSeconds') ? `${answer(answers, 'liveVideoRecording', 'durationSeconds')} seconds recorded locally` : 'Not recorded', 'liveVideoDuration'],
                  ['Saved video reference', answer(answers, 'liveVideoRecording', 'objectPath') ? 'Reference attached' : 'Not uploaded', 'liveVideoReference'],
                ])}
                {reviewStage(6, titleForStep(6), [
                  [fieldLabel(6, 'bankDetails.bankName', 'Bank'), answer(answers, 'bankDetails', 'bankName'), 'bankName'], [fieldLabel(6, 'bankDetails.accountHolder', 'Account holder'), answer(answers, 'bankDetails', 'accountHolder'), 'accountHolder'],
                  [fieldLabel(6, 'bankDetails.accountNumber', 'Account number'), answer(answers, 'bankDetails', 'accountNumberMasked') || accountNumberProvided ? 'Account details on file (masked)' : 'Not entered', 'accountNumber'],
                  [fieldLabel(6, 'bankDetails.accountType', 'Account type'), answer(answers, 'bankDetails', 'accountType'), 'accountType'],
                ])}
              </div>
              <section className="ew-declaration" data-testid="section-declaration">
                <div className="ew-declaration-heading"><ShieldCheck size={19} /><div><b>Applicant declaration</b><p>I confirm that the information above is complete and accurate to the best of my knowledge.</p></div></div>
                <label className="ew-consent-check"><input type="checkbox" {...register('reviewDeclarationAccepted')} data-testid="check-declaration" />
                  <span className="ew-checkmark" /><span>I have reviewed my information and agree to this declaration.</span></label>
                {errorFor('reviewDeclarationAccepted') && <span className="ew-field-error" role="alert" data-testid="error-reviewDeclarationAccepted">{errorFor('reviewDeclarationAccepted')}</span>}
              </section>
              <div className="ew-submit-gate" data-testid="state-submit-readiness">
                <span className="ew-gate-icon">{readyToSubmit ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</span>
                <div><b>{readyToSubmit ? 'Ready for your review' : 'A few required items are still missing'}</b>
                  <p>{missingUploads.length ? `Secure storage is unavailable. Required references still missing: ${missingUploads.join(', ')}.` : 'Complete the declaration and all required details before submitting.'}</p>
                </div>
              </div>
              {(error || submitError) && <p className="ew-form-alert" role="alert" data-testid="text-submit-error">{submitError || error}</p>}
            </div>
            <footer className="ew-form-footer">
              <button type="button" className="ew-button ew-button-quiet" onClick={() => setStep(6)} data-testid="button-preview-back"><ArrowLeft size={15} /> Back</button>
              <span className="ew-save-note">You can edit any section before submitting.</span>
              <button type="button" className="ew-button ew-button-primary" onClick={() => void beginSubmit()}
                disabled={!readyToSubmit || isSaving || isSubmitting || readOnly} data-testid="button-submit-enrollment">
                {isSubmitting ? 'Submitting…' : copyForStep(7).buttonLabel || 'Submit Enrollment'} <ArrowRight size={15} /></button>
            </footer>
          </div>}
      </section>
    </div>
  </main>;
}

export default EnrollmentWizard;
