import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Spin, Typography } from 'antd';
import axiosInstance from '../../Service/AxiosSetup';

const { Text } = Typography;

const DocxViewer = ({ docFileId }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!docFileId) return;

    const loadDocument = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await axiosInstance.get(`/exams/doc-files/${docFileId}/proxy`, {
          responseType: 'arraybuffer',
        });

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          await renderAsync(response.data, containerRef.current, null, {
            className: 'docx-viewer-content',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: false,
            trimXmlDeclaration: true,
            useBase64URL: true,
          });
        }
      } catch (err) {
        console.error('Error loading document:', err);
        setError('Không thể tải file. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [docFileId]);

  return (
    <div style={{ height: 'calc(100vh - 64px)', position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.8)',
          zIndex: 10,
        }}>
          <Spin size="large" />
          <Text type="secondary" style={{ marginTop: 16 }}>Đang tải bài làm...</Text>
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}>
          <Text type="danger">{error}</Text>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          height: '100%',
          overflow: 'auto',
          background: '#f5f5f5',
          padding: '16px',
        }}
      />
    </div>
  );
};

export default DocxViewer;
