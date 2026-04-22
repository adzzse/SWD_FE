import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Image,
  Input,
  InputNumber,
  Layout,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeOutlined,
  RobotOutlined,
  SafetyOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import axiosInstance from "../../Service/AxiosSetup";
import {
  getExamFlags,
  getExamPackets,
  getFlagById,
  resolvePacketThreshold,
  runExamPacketSimilarityCheck,
  runPacketSimilarityCheck,
  seedPacketSimilarityTestData,
  teacherReviewFlag,
  verifyFlagWithAI,
} from "../../Service/packetSimilarityService";

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const SCOPE_OPTIONS = [
  { label: "Cùng câu", value: "SameQuestion" },
  { label: "Toàn bài", value: "Global" },
];

const REVIEW_STATUS_OPTIONS = [
  { label: "Tất cả", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "AI Reviewed", value: "AI_REVIEWED" },
  { label: "Teacher Reviewed", value: "TEACHER_REVIEWED" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Rejected", value: "REJECTED" },
];

const percentFromDecimal = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  return Math.round(Number(value) * 10000) / 100;
};

const decimalFromPercent = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value) / 100;
};

const formatPercent = (value) => {
  const percent = percentFromDecimal(value);
  if (percent === null) return "-";
  return `${percent.toFixed(2)}%`;
};

const getFlagStatusColor = (status) => {
  switch (status) {
    case "PENDING":
      return "gold";
    case "AI_REVIEWED":
      return "cyan";
    case "TEACHER_REVIEWED":
      return "blue";
    case "CONFIRMED":
      return "red";
    case "REJECTED":
      return "green";
    default:
      return "default";
  }
};

const getPacketStatusColor = (status) => {
  switch (status) {
    case "READY":
      return "green";
    case "PROCESSING":
      return "blue";
    case "FAILED":
      return "red";
    case "PENDING":
      return "gold";
    default:
      return "default";
  }
};

const renderPacketPreview = (packet) => {
  if (!packet) return <Empty description="Không có packet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Descriptions
        bordered
        size="small"
        column={1}
        items={[
          {
            key: "student",
            label: "Sinh viên",
            children: `${packet.studentCode}${packet.studentName ? ` - ${packet.studentName}` : ""}`,
          },
          {
            key: "question",
            label: "Câu",
            children: packet.questionNumber,
          },
          {
            key: "status",
            label: "Packet status",
            children: <Tag color={getPacketStatusColor(packet.status)}>{packet.status}</Tag>,
          },
          {
            key: "confidence",
            label: "Confidence",
            children:
              packet.parseConfidence !== null && packet.parseConfidence !== undefined
                ? formatPercent(packet.parseConfidence)
                : "-",
          },
          {
            key: "source",
            label: "Nguồn",
            children: packet.originalFileName || packet.sourceFormat || "-",
          },
        ]}
      />

      <Card size="small" title="Extracted text">
        <Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
          {packet.extractedAnswerText || "Không có nội dung tách được."}
        </Paragraph>
      </Card>

      {packet.primaryImageUrl ? (
        <Card size="small" title="Ảnh packet">
          <Image
            src={packet.primaryImageUrl}
            alt={`Packet ${packet.id}`}
            style={{ maxHeight: 280, objectFit: "contain" }}
          />
        </Card>
      ) : null}

      {packet.originalFileUrl ? (
        <Text type="secondary">
          File gốc:{" "}
          <a href={packet.originalFileUrl} target="_blank" rel="noreferrer">
            {packet.originalFileName || packet.originalFileUrl}
          </a>
        </Text>
      ) : null}
    </Space>
  );
};

const PacketSimilarity = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");
  const role = localStorage.getItem("role");

  const [examInfo, setExamInfo] = useState(null);
  const [packets, setPackets] = useState([]);
  const [flags, setFlags] = useState([]);
  const [runResult, setRunResult] = useState(null);
  const [selectedPacketId, setSelectedPacketId] = useState(null);
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState(null);
  const [scope, setScope] = useState("SameQuestion");
  const [reviewStatus, setReviewStatus] = useState("ALL");
  const [useConfigThreshold, setUseConfigThreshold] = useState(true);
  const [thresholdPercent, setThresholdPercent] = useState(80);
  const [resolvedThreshold, setResolvedThreshold] = useState(null);
  const [loadingExam, setLoadingExam] = useState(false);
  const [loadingPackets, setLoadingPackets] = useState(false);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [resolvingThreshold, setResolvingThreshold] = useState(false);
  const [runningExamCheck, setRunningExamCheck] = useState(false);
  const [runningPacketId, setRunningPacketId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [pageError, setPageError] = useState("");

  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagDetail, setFlagDetail] = useState(null);
  const [loadingFlagDetail, setLoadingFlagDetail] = useState(false);
  const [aiVerifying, setAiVerifying] = useState(false);
  const [teacherDecision, setTeacherDecision] = useState(true);
  const [teacherNotes, setTeacherNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const questionOptions = Array.from(
    new Set(packets.map((packet) => packet.questionNumber).filter(Boolean))
  )
    .sort((a, b) => a - b)
    .map((questionNumber) => ({
      label: `Câu ${questionNumber}`,
      value: questionNumber,
    }));

  const getRequestThreshold = () => {
    if (useConfigThreshold) return null;
    return decimalFromPercent(thresholdPercent);
  };

  const loadExamInfo = async () => {
    if (!examId) {
      setPageError("Không tìm thấy examId.");
      return;
    }

    try {
      setLoadingExam(true);
      const response = await axiosInstance.get(`/exams/${examId}`);
      setExamInfo(response?.data?.data || null);
      setPageError("");
    } catch (error) {
      console.error("Lỗi tải exam info:", error);
      setPageError(error?.response?.data?.message || "Không thể tải thông tin bài thi.");
    } finally {
      setLoadingExam(false);
    }
  };

  const loadPackets = async () => {
    if (!examId) return;

    try {
      setLoadingPackets(true);
      const data = await getExamPackets(examId, {
        questionNumber: selectedQuestionNumber,
      });
      setPackets(data);

      if (data.length > 0 && !selectedPacketId) {
        setSelectedPacketId(data[0].id);
      }

      if (selectedPacketId && !data.some((packet) => packet.id === selectedPacketId)) {
        setSelectedPacketId(data[0]?.id ?? null);
      }
    } catch (error) {
      console.error("Lỗi tải packets:", error);
      message.error(error?.response?.data?.message || "Không thể tải question packets.");
    } finally {
      setLoadingPackets(false);
    }
  };

  const loadFlags = async () => {
    if (!examId) return;

    try {
      setLoadingFlags(true);
      const data = await getExamFlags(examId, {
        reviewStatus: reviewStatus === "ALL" ? null : reviewStatus,
        source: scope,
        questionNumber: selectedQuestionNumber,
      });
      setFlags(data);
    } catch (error) {
      console.error("Lỗi tải flags:", error);
      message.error(error?.response?.data?.message || "Không thể tải similarity flags.");
    } finally {
      setLoadingFlags(false);
    }
  };

  const loadResolvedThreshold = async () => {
    if (!examId) return;

    try {
      setResolvingThreshold(true);
      const data = await resolvePacketThreshold(examId, {
        scope,
        questionNumber: scope === "SameQuestion" ? selectedQuestionNumber : null,
        requestThreshold: getRequestThreshold(),
      });
      setResolvedThreshold(data);
    } catch (error) {
      console.error("Lỗi resolve threshold:", error);
      message.error(error?.response?.data?.message || "Không thể lấy effective threshold.");
    } finally {
      setResolvingThreshold(false);
    }
  };

  useEffect(() => {
    loadExamInfo();
  }, [examId]);

  useEffect(() => {
    loadPackets();
  }, [examId, selectedQuestionNumber]);

  useEffect(() => {
    loadFlags();
  }, [examId, reviewStatus, scope, selectedQuestionNumber]);

  useEffect(() => {
    loadResolvedThreshold();
  }, [examId, scope, selectedQuestionNumber, useConfigThreshold, thresholdPercent]);

  const handleSeedData = async () => {
    if (!examId) return;

    try {
      setSeeding(true);
      const response = await seedPacketSimilarityTestData(examId);
      message.success(response?.message || "Seed test data thành công.");
      await Promise.all([loadPackets(), loadFlags(), loadResolvedThreshold()]);
    } catch (error) {
      console.error("Lỗi seed data:", error);
      message.error(error?.response?.data?.message || "Không thể seed test data.");
    } finally {
      setSeeding(false);
    }
  };

  const handleRunExamCheck = async () => {
    if (!examId) return;

    try {
      setRunningExamCheck(true);
      const data = await runExamPacketSimilarityCheck(examId, {
        threshold: getRequestThreshold(),
        scope,
        questionNumber: scope === "SameQuestion" ? selectedQuestionNumber : null,
      });
      setRunResult(data);
      message.success("Đã chạy packet similarity cho exam.");
      await loadFlags();
    } catch (error) {
      console.error("Lỗi chạy exam similarity:", error);
      message.error(
        error?.response?.data?.message || "Không thể chạy packet similarity cho exam."
      );
    } finally {
      setRunningExamCheck(false);
    }
  };

  const handleRunPacketCheck = async (packetId) => {
    try {
      setRunningPacketId(packetId);
      const data = await runPacketSimilarityCheck(packetId, {
        threshold: getRequestThreshold(),
        scope,
      });
      setRunResult(data);
      message.success(`Đã chạy similarity cho packet #${packetId}.`);
      await loadFlags();
    } catch (error) {
      console.error("Lỗi chạy packet similarity:", error);
      message.error(error?.response?.data?.message || "Không thể chạy similarity cho packet.");
    } finally {
      setRunningPacketId(null);
    }
  };

  const openFlagDetail = async (flagId) => {
    try {
      setFlagModalOpen(true);
      setLoadingFlagDetail(true);
      const data = await getFlagById(flagId);
      setFlagDetail(data);
      setTeacherDecision(data?.teacherDecision ?? true);
      setTeacherNotes(data?.teacherNotes || "");
    } catch (error) {
      console.error("Lỗi tải flag detail:", error);
      setFlagModalOpen(false);
      message.error(error?.response?.data?.message || "Không thể tải chi tiết flag.");
    } finally {
      setLoadingFlagDetail(false);
    }
  };

  const handleVerifyWithAI = async () => {
    if (!flagDetail?.id) return;

    try {
      setAiVerifying(true);
      const data = await verifyFlagWithAI(flagDetail.id);
      setFlagDetail(data);
      message.success("Đã xác minh flag bằng AI.");
      await loadFlags();
    } catch (error) {
      console.error("Lỗi verify AI:", error);
      message.error(error?.response?.data?.message || "Không thể verify flag bằng AI.");
    } finally {
      setAiVerifying(false);
    }
  };

  const handleTeacherReview = async () => {
    if (!flagDetail?.id) return;

    try {
      setSubmittingReview(true);
      const data = await teacherReviewFlag(flagDetail.id, {
        isSimilar: teacherDecision,
        notes: teacherNotes,
      });
      setFlagDetail(data);
      message.success("Đã lưu teacher review.");
      await loadFlags();
    } catch (error) {
      console.error("Lỗi teacher review:", error);
      message.error(error?.response?.data?.message || "Không thể lưu teacher review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const packetColumns = [
    {
      title: "Packet",
      key: "packet",
      render: (_, packet) => (
        <Space direction="vertical" size={2}>
          <Text strong>#{packet.id}</Text>
          <Tag color={getPacketStatusColor(packet.status)}>{packet.status}</Tag>
        </Space>
      ),
    },
    {
      title: "Sinh viên",
      key: "student",
      render: (_, packet) => (
        <Space direction="vertical" size={2}>
          <Text strong>{packet.studentCode}</Text>
          <Text type="secondary">{packet.studentName || "-"}</Text>
        </Space>
      ),
    },
    {
      title: "Câu",
      dataIndex: "questionNumber",
      key: "questionNumber",
      width: 80,
    },
    {
      title: "Confidence",
      key: "confidence",
      width: 110,
      render: (_, packet) => formatPercent(packet.parseConfidence),
    },
    {
      title: "Extracted text",
      key: "text",
      render: (_, packet) => (
        <Paragraph
          ellipsis={{ rows: 3, expandable: true, symbol: "Xem thêm" }}
          style={{ marginBottom: 0, maxWidth: 420 }}
        >
          {packet.extractedAnswerText || "Không có nội dung"}
        </Paragraph>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      render: (_, packet) => (
        <Space direction="vertical" size="small">
          <Button
            type={selectedPacketId === packet.id ? "primary" : "default"}
            size="small"
            onClick={() => setSelectedPacketId(packet.id)}
          >
            Chọn packet
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            size="small"
            loading={runningPacketId === packet.id}
            onClick={() => handleRunPacketCheck(packet.id)}
          >
            Check packet
          </Button>
        </Space>
      ),
    },
  ];

  const flagColumns = [
    {
      title: "Flag",
      key: "flag",
      render: (_, flag) => (
        <Space direction="vertical" size={2}>
          <Text strong>#{flag.id}</Text>
          <Tag color={getFlagStatusColor(flag.reviewStatus)}>{flag.reviewStatusText || flag.reviewStatus}</Tag>
        </Space>
      ),
    },
    {
      title: "So sánh",
      key: "pair",
      render: (_, flag) => (
        <Space direction="vertical" size={2}>
          <Text>
            {flag.packet?.studentCode} Q{flag.packet?.questionNumber}
          </Text>
          <Text type="secondary">
            {flag.matchedPacket?.studentCode} Q{flag.matchedPacket?.questionNumber}
          </Text>
        </Space>
      ),
    },
    {
      title: "Scope",
      dataIndex: "source",
      key: "source",
      width: 120,
    },
    {
      title: "Similarity",
      key: "similarityScore",
      width: 120,
      render: (_, flag) => formatPercent(flag.similarityScore),
    },
    {
      title: "Threshold",
      key: "thresholdUsed",
      width: 120,
      render: (_, flag) => formatPercent(flag.thresholdUsed),
    },
    {
      title: "Kết luận GV",
      key: "teacherDecision",
      width: 130,
      render: (_, flag) =>
        flag.teacherDecision === null || flag.teacherDecision === undefined ? (
          <Text type="secondary">Chưa review</Text>
        ) : flag.teacherDecision ? (
          <Tag color="red">Có đạo văn</Tag>
        ) : (
          <Tag color="green">Không đạo văn</Tag>
        ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 140,
      render: (_, flag) => (
        <Button
          icon={<EyeOutlined />}
          type="primary"
          size="small"
          onClick={() => openFlagDetail(flag.id)}
        >
          Review
        </Button>
      ),
    },
  ];

  if (!examId) {
    return (
      <Layout style={{ minHeight: "100vh", background: "#f5f7fa" }}>
        <Content style={{ padding: 24 }}>
          <Alert type="error" message="Không tìm thấy examId để mở packet similarity." showIcon />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: "100vh", background: "#f5f7fa" }}>
      <Content style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card bodyStyle={{ padding: 24 }}>
            <Space
              align="start"
              style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}
            >
              <Space direction="vertical" size={4}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/list-student?examId=${examId}`)}>
                  Quay lại danh sách học sinh
                </Button>
                <Title level={3} style={{ margin: 0 }}>
                  Packet Similarity Lab
                </Title>
                {loadingExam ? (
                  <Text type="secondary">Đang tải thông tin bài thi...</Text>
                ) : (
                  <Text type="secondary">
                    {examInfo
                      ? `Exam [${examInfo.examCode || examId}] ${examInfo.title || ""}`
                      : `Exam #${examId}`}
                  </Text>
                )}
              </Space>

              <Space wrap>
                {role === "EXAMINATION" ? (
                  <Button
                    icon={<DatabaseOutlined />}
                    onClick={handleSeedData}
                    loading={seeding}
                  >
                    Seed test data
                  </Button>
                ) : null}
                <Button icon={<SyncOutlined />} onClick={() => loadPackets()} loading={loadingPackets}>
                  Refresh packets
                </Button>
                <Button icon={<SyncOutlined />} onClick={() => loadFlags()} loading={loadingFlags}>
                  Refresh flags
                </Button>
              </Space>
            </Space>

            {pageError ? (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 16 }}
                message="Không thể tải dữ liệu exam"
                description={pageError}
              />
            ) : null}
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Card title="Threshold & Scope" extra={<SafetyOutlined />}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={12}>
                      <Text strong>Scope</Text>
                      <Select
                        style={{ width: "100%", marginTop: 8 }}
                        value={scope}
                        options={SCOPE_OPTIONS}
                        onChange={(value) => setScope(value)}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Text strong>Lọc câu</Text>
                      <Select
                        allowClear
                        placeholder="Tất cả câu"
                        style={{ width: "100%", marginTop: 8 }}
                        value={selectedQuestionNumber}
                        options={questionOptions}
                        onChange={(value) => setSelectedQuestionNumber(value ?? null)}
                      />
                    </Col>
                  </Row>

                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={12}>
                      <Text strong>Threshold mode</Text>
                      <Select
                        style={{ width: "100%", marginTop: 8 }}
                        value={useConfigThreshold ? "CONFIG" : "CUSTOM"}
                        options={[
                          { label: "Dùng config từ BE", value: "CONFIG" },
                          { label: "Custom threshold", value: "CUSTOM" },
                        ]}
                        onChange={(value) => setUseConfigThreshold(value === "CONFIG")}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Text strong>Custom threshold (%)</Text>
                      <InputNumber
                        style={{ width: "100%", marginTop: 8 }}
                        min={0}
                        max={100}
                        disabled={useConfigThreshold}
                        value={thresholdPercent}
                        onChange={(value) => setThresholdPercent(value ?? 80)}
                      />
                    </Col>
                  </Row>

                  <Space wrap>
                    <Button
                      icon={<SafetyOutlined />}
                      onClick={loadResolvedThreshold}
                      loading={resolvingThreshold}
                    >
                      Resolve threshold
                    </Button>
                    <Button
                      type="primary"
                      icon={<ExperimentOutlined />}
                      onClick={handleRunExamCheck}
                      loading={runningExamCheck}
                    >
                      Run exam similarity
                    </Button>
                  </Space>

                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={8}>
                      <Statistic
                        title="Effective threshold"
                        value={percentFromDecimal(resolvedThreshold?.effectiveThreshold) || 0}
                        precision={2}
                        suffix="%"
                        loading={resolvingThreshold}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <Statistic
                        title="Nguồn threshold"
                        value={resolvedThreshold?.requestThreshold ? "Custom" : "Config"}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <Statistic
                        title="Question filter"
                        value={resolvedThreshold?.questionNumber ?? "All"}
                      />
                    </Col>
                  </Row>

                  <Text type="secondary">
                    FE này đang bám đúng BE hiện tại: threshold chỉ được override khi gửi request check,
                    còn config threshold gốc được đọc qua endpoint effective threshold.
                  </Text>
                </Space>
              </Card>
            </Col>

            <Col xs={24} xl={14}>
              <Card title="Kết quả chạy gần nhất" extra={<ExperimentOutlined />}>
                {!runResult ? (
                  <Empty description="Chưa có lần chạy packet similarity nào trong phiên này." />
                ) : (
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <Row gutter={[12, 12]}>
                      <Col xs={12} md={8}>
                        <Statistic title="Packets" value={runResult.totalPacketsConsidered} />
                      </Col>
                      <Col xs={12} md={8}>
                        <Statistic title="Comparisons" value={runResult.totalComparisons} />
                      </Col>
                      <Col xs={12} md={8}>
                        <Statistic title="Flagged pairs" value={runResult.flaggedPairs} />
                      </Col>
                      <Col xs={12} md={8}>
                        <Statistic title="Created flags" value={runResult.createdFlags} />
                      </Col>
                      <Col xs={12} md={8}>
                        <Statistic title="Updated flags" value={runResult.updatedFlags} />
                      </Col>
                      <Col xs={12} md={8}>
                        <Statistic
                          title="Threshold used"
                          value={percentFromDecimal(runResult.threshold) || 0}
                          precision={2}
                          suffix="%"
                        />
                      </Col>
                    </Row>

                    <Alert
                      type="info"
                      showIcon
                      message={`Scope: ${runResult.scope}`}
                      description={
                        runResult.requestedThreshold !== null &&
                        runResult.requestedThreshold !== undefined
                          ? `Requested threshold: ${formatPercent(runResult.requestedThreshold)}`
                          : "Threshold lấy từ config backend."
                      }
                    />
                  </Space>
                )}
              </Card>
            </Col>
          </Row>

          <Card
            title="Question packets"
            extra={
              <Text type="secondary">
                {loadingPackets ? "Đang tải..." : `${packets.length} packet`}
              </Text>
            }
          >
            {loadingPackets ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Spin size="large" />
              </div>
            ) : packets.length === 0 ? (
              <Empty description="Chưa có question packet nào cho filter hiện tại." />
            ) : (
              <Table
                rowKey="id"
                columns={packetColumns}
                dataSource={packets}
                pagination={{ pageSize: 6 }}
                scroll={{ x: 960 }}
              />
            )}
          </Card>

          <Card
            title="Packet đang chọn"
            extra={
              selectedPacketId ? (
                <Button
                  type="primary"
                  icon={<ExperimentOutlined />}
                  loading={runningPacketId === selectedPacketId}
                  onClick={() => handleRunPacketCheck(selectedPacketId)}
                >
                  Check packet này
                </Button>
              ) : null
            }
          >
            {renderPacketPreview(
              packets.find((packet) => packet.id === selectedPacketId) || packets[0] || null
            )}
          </Card>

          <Card
            title="Similarity flags"
            extra={
              <Space wrap>
                <Select
                  style={{ width: 180 }}
                  value={reviewStatus}
                  options={REVIEW_STATUS_OPTIONS}
                  onChange={setReviewStatus}
                />
              </Space>
            }
          >
            {loadingFlags ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Spin size="large" />
              </div>
            ) : flags.length === 0 ? (
              <Empty description="Chưa có similarity flag nào cho filter hiện tại." />
            ) : (
              <Table
                rowKey="id"
                columns={flagColumns}
                dataSource={flags}
                pagination={{ pageSize: 6 }}
                scroll={{ x: 920 }}
              />
            )}
          </Card>
        </Space>
      </Content>

      <Modal
        title={flagDetail ? `Review flag #${flagDetail.id}` : "Review flag"}
        open={flagModalOpen}
        onCancel={() => {
          if (!submittingReview && !aiVerifying) {
            setFlagModalOpen(false);
            setFlagDetail(null);
          }
        }}
        footer={null}
        width={1200}
        destroyOnClose
      >
        {loadingFlagDetail || !flagDetail ? (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <Spin size="large" />
          </div>
        ) : (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions
              bordered
              size="small"
              column={2}
              items={[
                {
                  key: "score",
                  label: "Similarity score",
                  children: formatPercent(flagDetail.similarityScore),
                },
                {
                  key: "threshold",
                  label: "Threshold used",
                  children: formatPercent(flagDetail.thresholdUsed),
                },
                {
                  key: "source",
                  label: "Source",
                  children: flagDetail.source,
                },
                {
                  key: "status",
                  label: "Review status",
                  children: (
                    <Tag color={getFlagStatusColor(flagDetail.reviewStatus)}>
                      {flagDetail.reviewStatusText || flagDetail.reviewStatus}
                    </Tag>
                  ),
                },
              ]}
            />

            <Row gutter={[16, 16]}>
              <Col xs={24} xl={12}>
                <Card title="Packet A">{renderPacketPreview(flagDetail.packet)}</Card>
              </Col>
              <Col xs={24} xl={12}>
                <Card title="Packet B">{renderPacketPreview(flagDetail.matchedPacket)}</Card>
              </Col>
            </Row>

            <Card
              title="AI verification"
              extra={
                <Button
                  icon={<RobotOutlined />}
                  loading={aiVerifying}
                  onClick={handleVerifyWithAI}
                >
                  Verify with AI
                </Button>
              }
            >
              {flagDetail.aiVerifiedSimilar === null || flagDetail.aiVerifiedSimilar === undefined ? (
                <Empty description="Flag này chưa được AI verify." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Alert
                    type={flagDetail.aiVerifiedSimilar ? "warning" : "success"}
                    showIcon
                    message={
                      flagDetail.aiVerifiedSimilar
                        ? "AI đánh giá hai packet tương đồng"
                        : "AI đánh giá hai packet không tương đồng"
                    }
                    description={`Confidence: ${formatPercent(flagDetail.aiConfidenceScore)}`}
                  />
                  <Card size="small" title="AI summary">
                    <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                      {flagDetail.aiSummary || "Không có summary"}
                    </Paragraph>
                  </Card>
                  <Card size="small" title="AI analysis">
                    <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                      {flagDetail.aiAnalysis || "Không có analysis"}
                    </Paragraph>
                  </Card>
                </Space>
              )}
            </Card>

            <Card title="Teacher review">
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Select
                  style={{ width: 260 }}
                  value={teacherDecision ? "SIMILAR" : "NOT_SIMILAR"}
                  options={[
                    { label: "Xác nhận có đạo văn", value: "SIMILAR" },
                    { label: "Xác nhận không đạo văn", value: "NOT_SIMILAR" },
                  ]}
                  onChange={(value) => setTeacherDecision(value === "SIMILAR")}
                />

                <TextArea
                  rows={4}
                  placeholder="Ghi chú cho kết luận của giảng viên..."
                  value={teacherNotes}
                  onChange={(event) => setTeacherNotes(event.target.value)}
                  maxLength={500}
                />

                <Space wrap>
                  <Button
                    type="primary"
                    icon={<SafetyOutlined />}
                    loading={submittingReview}
                    onClick={handleTeacherReview}
                  >
                    Lưu teacher review
                  </Button>
                  <Text type="secondary">
                    Reviewer: {flagDetail.reviewerUsername || "Chưa có"}
                  </Text>
                </Space>
              </Space>
            </Card>

            {flagDetail.teacherNotes ? (
              <Alert
                type="info"
                showIcon
                message={
                  flagDetail.teacherDecision ? "Giảng viên kết luận có đạo văn" : "Giảng viên kết luận không đạo văn"
                }
                description={flagDetail.teacherNotes}
              />
            ) : null}

            {runResult?.flags?.length ? (
              <Card title="Flags từ lần chạy gần nhất">
                <List
                  dataSource={runResult.flags}
                  renderItem={(flag) => (
                    <List.Item
                      actions={[
                        <Button key="view" size="small" onClick={() => openFlagDetail(flag.id)}>
                          Xem
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <Text strong>Flag #{flag.id}</Text>
                            <Tag color={getFlagStatusColor(flag.reviewStatus)}>
                              {flag.reviewStatusText || flag.reviewStatus}
                            </Tag>
                          </Space>
                        }
                        description={`${flag.packet?.studentCode} Q${flag.packet?.questionNumber} <> ${flag.matchedPacket?.studentCode} Q${flag.matchedPacket?.questionNumber} | Score ${formatPercent(flag.similarityScore)}`}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            ) : null}
          </Space>
        )}
      </Modal>
    </Layout>
  );
};

export default PacketSimilarity;
